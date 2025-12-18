import { z } from 'zod';
import { ModelDefinition, StepDefinition, NormalizedConfig, PluginConfigDefinition, OutputStrategy } from '../types.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ModelFlags } from './ModelFlags.js';
import { GlobalsConfigSchema } from '../config/schema.js';

// =============================================================================
// Zod Schemas for CLI Config (Single source of truth for defaults)
// =============================================================================

// Helper to remove undefined keys
const clean = <T extends object>(obj: T): T => {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T;
};

// Helper to get env var with fallbacks
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

// Helper to resolve OutputStrategy with Limit/Offset Hierarchy
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
    const outputCol = getOpt('Output') || getOpt('OutputColumn'); 
    const exportVal = !!getOpt('Export');

    let mode: 'merge' | 'column' | 'ignore' = 'ignore';
    let columnName: string | undefined = undefined;

    if (outputCol) {
        mode = 'column';
        columnName = String(outputCol);
    } else if (exportVal) {
        mode = 'merge';
    }

    // --- Resolve Limit & Offset Hierarchy ---
    // 1. Step Specific (e.g. --limit-1)
    // 2. Category Default (e.g. --explode-limit)
    // 3. Master Default (e.g. --limit)

    const getHierarchyVal = (suffix: string, categorySuffix: string, masterKey: string) => {
        // 1. Step Specific
        // e.g. webSearchLimit1 or limit1
        const specificKey = prefix ? `${prefix}${suffix}${stepIndex}` : `${suffix.toLowerCase()}${stepIndex}`;
        if (options[specificKey] !== undefined) return options[specificKey];

        // 2. Category Default (Explode)
        // e.g. webSearchExplodeLimit or explodeLimit
        const categoryKey = prefix ? `${prefix}${categorySuffix}` : categorySuffix.charAt(0).toLowerCase() + categorySuffix.slice(1);
        if (options[categoryKey] !== undefined) return options[categoryKey];

        // 3. Master Default
        if (options[masterKey] !== undefined) return options[masterKey];

        return undefined;
    };

    const limitRaw = getHierarchyVal('Limit', 'ExplodeLimit', 'limit');
    const offsetRaw = getHierarchyVal('Offset', 'ExplodeOffset', 'offset');

    const limit = limitRaw ? parseInt(String(limitRaw), 10) : undefined;
    const offset = offsetRaw ? parseInt(String(offsetRaw), 10) : undefined;

    return {
        mode,
        columnName,
        explode,
        limit,
        offset
    };
};

export const createConfigSchema = (pluginRegistry: PluginRegistryV2) => z.object({
    options: z.record(z.string(), z.any()),
    args: z.array(z.string())
}).transform((input): NormalizedConfig => {
    const { options, args } = input;
    
    // Determine Max Step
    let maxStep = Math.max(1, args.length); 
    Object.keys(options).forEach(key => {
        const match = key.match(/(\d+)(?:[A-Z]|$)/);
        if (match) {
            const stepNum = parseInt(match[1], 10);
            if (stepNum > maxStep) maxStep = stepNum;
        }
    });

    // Resolve Global Model Default
    const envModel = getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']);
    const globalModel = options.model || envModel;

    // Parse global config
    const rawGlobalConfig = {
        concurrency: options.concurrency ? parseInt(String(options.concurrency), 10) : undefined,
        taskConcurrency: options.taskConcurrency ? parseInt(String(options.taskConcurrency), 10) : undefined,
        tmpDir: options.tmpDir,
        dataOutputPath: options.dataOutput,
        model: globalModel,
        timeout: options.timeout ? parseInt(String(options.timeout), 10) : undefined
    };
    
    const globalConfig = GlobalsConfigSchema.parse(rawGlobalConfig);

    const modelFlags = new ModelFlags(globalModel);
    const strictModelFlags = new ModelFlags();

    const steps: StepDefinition[] = [];

    for (let i = 1; i <= maxStep; i++) {
        // 1. Main Model
        const mainModel = modelFlags.extract(options, `${i}`, '');
        
        // 2. Prompt Merging
        const posArg = args[i - 1]; 
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
        const isJudgeConfigured = !!(strictJudge.promptSource || strictJudge.systemSource);
        const judge = modelFlags.extract(options, `judge-${i}`, 'judge') as ModelDefinition;
        
        const strictFeedback = strictModelFlags.extract(options, `feedback-${i}`, 'feedback');
        const isFeedbackConfigured = !!(strictFeedback.promptSource || strictFeedback.systemSource);
        const feedback = modelFlags.extract(options, `feedback-${i}`, 'feedback') as ModelDefinition;
        
        // 4. Step Options & Output Strategy
        const getStepOpt = (key: string): string | undefined => {
            const specific = options[`${key}${i}`];
            if (specific !== undefined) return String(specific);
            const global = options[key];
            if (global !== undefined) return String(global);
            return undefined;
        };

        // Resolve Main Model Output Strategy (using the hierarchy helper with empty prefix)
        const modelOutputStrategy = resolveOutputStrategy(options, '', i);

        // 5. Plugins
        const plugins: PluginConfigDefinition[] = [];
        for (const plugin of pluginRegistry.getAll()) {
            const rawConfig = plugin.parseCLIOptions(options, i);
            if (rawConfig) {
                const camelName = toCamel(plugin.type);
                const pluginOutputStrategy = resolveOutputStrategy(options, camelName, i);

                plugins.push({
                    name: plugin.type,
                    config: rawConfig,
                    output: pluginOutputStrategy
                });
            }
        }

        const candidatesRaw = getStepOpt('candidates');
        const candidates = candidatesRaw ? parseInt(candidatesRaw, 10) : 1;

        const feedbackLoopsRaw = getStepOpt('feedbackLoops');
        const feedbackLoops = feedbackLoopsRaw ? parseInt(feedbackLoopsRaw, 10) : 0;

        const timeoutRaw = getStepOpt('timeout');
        const timeout = timeoutRaw ? parseInt(timeoutRaw, 10) : globalConfig.timeout;

        steps.push(clean({
            stepIndex: i,
            modelConfig: baseModel,
            
            outputPath: getStepOpt('output'),
            outputTemplate: getStepOpt('output'),
            
            output: modelOutputStrategy,
            
            schemaPath: options[`jsonSchema${i}`] ? String(options[`jsonSchema${i}`]) : (options.schema ? String(options.schema) : undefined),
            verifyCommand: getStepOpt('verifyCommand'),
            postProcessCommand: getStepOpt('command'),
            
            candidates: candidates,
            noCandidateCommand: !!(options[`skipCandidateCommand${i}`] || options.skipCandidateCommand),
            
            judge: isJudgeConfigured ? judge : undefined,
            feedback: isFeedbackConfigured ? feedback : undefined,
            feedbackLoops: feedbackLoops,
            
            aspectRatio: getStepOpt('aspectRatio'),
            plugins,
            preprocessors: [],
            timeout: timeout
        }));
    }

    // Resolve Data Limits (Hierarchy: Input Specific > Master)
    const inputLimitRaw = options.inputLimit ?? options.limit;
    const inputOffsetRaw = options.inputOffset ?? options.offset;

    return {
        global: globalConfig,
        steps,
        data: {
            format: 'auto',
            offset: inputOffsetRaw ? parseInt(String(inputOffsetRaw), 10) : undefined,
            limit: inputLimitRaw ? parseInt(String(inputLimitRaw), 10) : undefined
        }
    };
});
