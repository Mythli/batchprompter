import { z } from 'zod';
import { ModelDefinition, StepDefinition, NormalizedConfig, PluginConfigDefinition, OutputStrategy } from '../types.js';
import { PluginRegistry } from '../plugins/PluginRegistry.js';
import { ModelFlags } from './ModelFlags.js';

// Helper to remove undefined keys
const clean = <T extends object>(obj: T): T => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T;
};

// Helper to get env var with fallbacks (duplicated from getConfig to ensure consistency during sync parsing)
function getEnvVar(keys: string[]): string | undefined {
    for (const key of keys) {
        const value = process.env[key];
        if (value) return value;
    }
    return undefined;
}

// Helper to convert kebab-case plugin name to camelCase for option lookup
const toCamel = (s: string) => {
    return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
};

// Helper to resolve OutputStrategy
const resolveOutputStrategy = (options: Record<string, any>, prefix: string, stepIndex: number): OutputStrategy => {
    // Prefix is e.g. "webSearch" or "" (for main model)
    
    const getOpt = (suffix: string) => {
        // Try specific step: prefix + Suffix + stepIndex (e.g. webSearchExplode1)
        // Or global: prefix + Suffix (e.g. webSearchExplode)
        const key = prefix ? `${prefix}${suffix}` : suffix.toLowerCase(); // for main model, suffix is "Explode" -> "explode"
        
        // Handle main model case where prefix is empty
        const specificKey = prefix ? `${key}${stepIndex}` : `${suffix.toLowerCase()}${stepIndex}`;
        const globalKey = prefix ? key : suffix.toLowerCase();

        return options[specificKey] || options[globalKey];
    };

    const explode = !!getOpt('Explode');
    const outputCol = getOpt('Output') || getOpt('OutputColumn'); // Support both --output and --output-column aliases if needed, mostly --output-column for plugins
    const exportVal = !!getOpt('Export');

    let mode: 'merge' | 'column' | 'ignore' = 'ignore';
    let columnName: string | undefined = undefined;

    if (outputCol) {
        mode = 'column';
        columnName = String(outputCol);
    } else if (exportVal) {
        mode = 'merge';
    } else if (!prefix && outputCol) { 
        // Main model specific: if outputColumn is set (via --output-column), it implies column mode.
        // The getOpt logic above handles the lookup.
    } 
    
    // Special case for Main Model: 
    // In the old logic: "else if (outputColumn) exportResult = true;"
    // If it's the main model (prefix == ''), and we have an output column, we definitely want to save it.
    
    return {
        mode,
        columnName,
        explode
    };
};

export const createConfigSchema = (pluginRegistry: PluginRegistry) => z.object({
    options: z.record(z.string(), z.any()),
    args: z.array(z.string())
}).transform((input): NormalizedConfig => {
    const { options, args } = input;
    const dataFilePath = args[0];
    if (!dataFilePath) throw new Error("Data file path is required.");

    // Determine Max Step
    let maxStep = Math.max(1, args.length - 1); // At least 1 step
    
    // Scan options for step indicators to expand maxStep if needed
    Object.keys(options).forEach(key => {
        // Check for keys ending in a number (e.g. output1, judge1Model)
        const match = key.match(/(\d+)(?:[A-Z]|$)/);
        if (match) {
            const stepNum = parseInt(match[1], 10);
            if (stepNum > maxStep) maxStep = stepNum;
        }
    });

    // Resolve Global Model Default
    // Priority: Flag > Env Var > Hardcoded
    const envModel = getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']);
    const globalModel = options.model || envModel;

    const globalConfig = {
        concurrency: parseInt(String(options.concurrency || '20'), 10),
        taskConcurrency: parseInt(String(options.taskConcurrency || '100'), 10),
        tmpDir: String(options.tmpDir || '.tmp'),
        dataOutputPath: options.dataOutput ? String(options.dataOutput) : undefined,
        model: globalModel
    };

    // Instantiate ModelFlags with the resolved global model
    const modelFlags = new ModelFlags(globalModel);
    // Instantiate a strict ModelFlags (no default) to check for explicit configuration
    const strictModelFlags = new ModelFlags();

    const steps: StepDefinition[] = [];

    for (let i = 1; i <= maxStep; i++) {
        // 1. Main Model
        const mainModel = modelFlags.extract(options, `${i}`, '');
        
        // 2. Prompt Merging
        const posArg = args[i]; // args[0] is data
        let promptSource = mainModel?.promptSource;
        
        if (posArg) {
            if (promptSource) {
                promptSource = `${promptSource}\n\n${posArg}`;
            } else {
                promptSource = posArg;
            }
        }

        const baseModel: ModelDefinition = clean({
            ...(mainModel as ModelDefinition),
            promptSource: promptSource
        });

        // 3. Auxiliary Models
        const strictJudge = strictModelFlags.extract(options, `judge-${i}`, 'judge');
        const isJudgeConfigured = Object.keys(strictJudge).length > 0;
        const judge = modelFlags.extract(options, `judge-${i}`, 'judge') as ModelDefinition;
        const feedback = modelFlags.extract(options, `feedback-${i}`, 'feedback') as ModelDefinition;
        
        // 4. Step Options & Output Strategy
        // Main Model Output Strategy
        // We need to handle the specific logic for main model output flags
        // --output-column, --export, --explode
        
        const getStepOpt = (key: string): string | undefined => {
            const specific = options[`${key}${i}`];
            if (specific !== undefined) return String(specific);
            const global = options[key];
            if (global !== undefined) return String(global);
            return undefined;
        };

        const outputColumn = getStepOpt('outputColumn');
        const exportFlag = !!(options[`exportResult${i}`] || options[`export${i}`] || options.exportResult || options.export);
        const explodeFlag = !!(options[`explode${i}`] || options.explode);

        let modelOutputMode: 'merge' | 'column' | 'ignore' = 'ignore';
        if (outputColumn) modelOutputMode = 'column';
        else if (exportFlag) modelOutputMode = 'merge';

        const modelOutputStrategy: OutputStrategy = {
            mode: modelOutputMode,
            columnName: outputColumn,
            explode: explodeFlag
        };

        // 5. Plugins
        const plugins: PluginConfigDefinition[] = [];
        for (const plugin of pluginRegistry.getAll()) {
            const normalized = plugin.normalize(options, i, globalConfig);
            if (normalized) {
                const camelName = toCamel(plugin.name);
                const pluginOutputStrategy = resolveOutputStrategy(options, camelName, i);

                plugins.push({
                    name: plugin.name,
                    config: normalized.config,
                    output: pluginOutputStrategy
                });
            }
        }

        const candidates = parseInt(getStepOpt('candidates') || '1', 10);

        steps.push(clean({
            stepIndex: i,
            modelConfig: baseModel,
            
            outputPath: getStepOpt('output'),
            outputTemplate: getStepOpt('output'), // Alias
            
            output: modelOutputStrategy,
            
            schemaPath: options[`jsonSchema${i}`] ? String(options[`jsonSchema${i}`]) : (options.schema ? String(options.schema) : undefined),
            verifyCommand: getStepOpt('verifyCommand'),
            postProcessCommand: getStepOpt('command'),
            
            candidates: candidates,
            noCandidateCommand: !!(options[`skipCandidateCommand${i}`] || options.skipCandidateCommand),
            
            judge: isJudgeConfigured ? judge : undefined,
            feedback: Object.keys(feedback).length > 0 ? feedback : undefined,
            feedbackLoops: parseInt(getStepOpt('feedbackLoops') || '0', 10),
            
            aspectRatio: getStepOpt('aspectRatio'),
            plugins,
            preprocessors: [] // Initialized empty, populated in StepRegistry
        }));
    }

    return {
        dataFilePath,
        global: globalConfig,
        steps
    };
});
