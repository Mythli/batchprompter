import { z } from 'zod';
import { ModelDefinition, StepDefinition, NormalizedConfig, PluginConfigDefinition } from '../types.js';
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
    const globalModel = String(options.model || envModel || 'gpt-4o');

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
        // Namespace "1", Fallback "" (Global)
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

        // Ensure we have a base model definition
        const baseModel: ModelDefinition = clean({
            ...(mainModel as ModelDefinition),
            promptSource: promptSource
        });

        // 3. Auxiliary Models
        // Check if judge is explicitly configured (ignoring default model)
        const strictJudge = strictModelFlags.extract(options, `judge-${i}`, 'judge');
        const isJudgeConfigured = Object.keys(strictJudge).length > 0;
        
        // Get full judge config (with default model if needed, though we only use it if configured)
        const judge = modelFlags.extract(options, `judge-${i}`, 'judge') as ModelDefinition;
        
        const feedback = modelFlags.extract(options, `feedback-${i}`, 'feedback') as ModelDefinition;
        
        // 4. Step Options
        const getStepOpt = (key: string): string | undefined => {
            // Try "output1" then "output"
            const specific = options[`${key}${i}`];
            if (specific !== undefined) return String(specific);
            const global = options[key];
            if (global !== undefined) return String(global);
            return undefined;
        };

        const outputColumn = getStepOpt('outputColumn');
        
        // Determine exportResult
        // Explicit flag > implied by outputColumn > default false
        let exportResult = false;
        if (options[`exportResult${i}`] !== undefined) exportResult = !!options[`exportResult${i}`];
        else if (options.exportResult !== undefined) exportResult = !!options.exportResult;
        else if (outputColumn) exportResult = true;

        // Determine Strategy
        const strategy = (options[`explode${i}`] || options.explode) ? 'explode' : 'merge';

        // 5. Plugins
        const plugins: PluginConfigDefinition[] = [];
        for (const plugin of pluginRegistry.getAll()) {
            const normalized = plugin.normalize(options, i, globalConfig);
            if (normalized) {
                plugins.push({
                    name: plugin.name,
                    config: normalized.config,
                    exportData: normalized.exportData
                });
            }
        }

        const candidates = parseInt(getStepOpt('candidates') || '1', 10);

        // Validation: Require explicit judge configuration if multiple candidates are requested
        if (candidates > 1 && !isJudgeConfigured) {
             throw new Error(`Step ${i} Error: Multiple candidates (${candidates}) requested without a judge configuration. Please configure a judge (e.g. --judge-model, --judge-prompt) or set candidates to 1.`);
        }

        steps.push(clean({
            stepIndex: i,
            modelConfig: baseModel,
            
            outputPath: getStepOpt('output'),
            outputColumn: outputColumn,
            outputTemplate: getStepOpt('output'), // Alias
            exportResult,
            strategy,
            
            schemaPath: options[`jsonSchema${i}`] ? String(options[`jsonSchema${i}`]) : (options.schema ? String(options.schema) : undefined),
            verifyCommand: getStepOpt('verifyCommand'),
            postProcessCommand: getStepOpt('command'), // --command -> command1 -> postProcessCommand
            
            candidates: candidates,
            noCandidateCommand: !!(options[`skipCandidateCommand${i}`] || options.skipCandidateCommand),
            
            // Only pass the judge config if it was explicitly configured
            judge: isJudgeConfigured ? judge : undefined,
            feedback: Object.keys(feedback).length > 0 ? feedback : undefined,
            feedbackLoops: parseInt(getStepOpt('feedbackLoops') || '0', 10),
            
            aspectRatio: getStepOpt('aspectRatio'),
            plugins
        }));
    }

    return {
        dataFilePath,
        global: globalConfig,
        steps
    };
});
