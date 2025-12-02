import { z } from 'zod';
import { ModelDefinition, StepDefinition, ImageSearchDefinition, NormalizedConfig } from '../types.js';

// Helper to extract Model Definition from flat options
const extractModel = (
    options: Record<string, any>, 
    namespace: string, // e.g. "1", "judge-1", "judge"
    fallbackNamespace: string | null // e.g. "judge", "" (global)
): ModelDefinition | undefined => {
    
    // Helper to construct camelCase keys from namespace + suffix
    const getKey = (ns: string, suffix: string) => {
        if (!ns) return suffix; // global model -> options.model
        // ns="1", suffix="model" -> "1Model"
        // ns="judge", suffix="model" -> "judgeModel"
        // ns="judge-1", suffix="model" -> "judge1Model"
        return ns.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase()) + suffix.charAt(0).toUpperCase() + suffix.slice(1);
    };

    const getVal = (suffix: string): any => {
        const specificKey = getKey(namespace, suffix);
        if (options[specificKey] !== undefined) return options[specificKey];
        
        if (fallbackNamespace !== null) {
            const fallbackKey = getKey(fallbackNamespace, suffix);
            if (options[fallbackKey] !== undefined) return options[fallbackKey];
        }
        return undefined;
    };

    const model = getVal('model');
    // If no model specified, we can't form a definition unless it's the main model falling back to global
    if (!model) return undefined;

    return {
        model: String(model),
        temperature: getVal('temperature') ? Number(getVal('temperature')) : undefined,
        thinkingLevel: getVal('thinkingLevel') as 'low' | 'medium' | 'high' | undefined, // thinking-level -> thinkingLevel
        systemSource: getVal('system') ? String(getVal('system')) : undefined,
        promptSource: getVal('prompt') ? String(getVal('prompt')) : undefined
    };
};

export const ConfigSchema = z.object({
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

    const steps: StepDefinition[] = [];

    for (let i = 1; i <= maxStep; i++) {
        // 1. Main Model
        // Namespace "1", Fallback "" (Global)
        const mainModel = extractModel(options, `${i}`, '');
        
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

        // Ensure we have a base model definition even if extractModel returned undefined
        // (e.g. if only global model is set, or only prompt is set)
        const baseModel: ModelDefinition = mainModel || {
            model: String(options.model || ''), 
            promptSource: undefined
        };
        
        // Update prompt source with merged value
        baseModel.promptSource = promptSource;

        // 3. Auxiliary Models
        const judge = extractModel(options, `judge-${i}`, 'judge');
        const feedback = extractModel(options, `feedback-${i}`, 'feedback');
        
        // Image Search Agents
        const imageQueryConfig = extractModel(options, `image-query-${i}`, 'image-query');
        const imageSelectConfig = extractModel(options, `image-select-${i}`, 'image-select');

        // 4. Step Options
        const getStepOpt = (key: string): string | undefined => {
            // Try "output1" then "output"
            const specific = options[`${key}${i}`];
            if (specific !== undefined) return String(specific);
            const global = options[key];
            if (global !== undefined) return String(global);
            return undefined;
        };

        const imageSearch: ImageSearchDefinition | undefined = (() => {
            const query = getStepOpt('imageSearchQuery');
            const limit = parseInt(getStepOpt('imageSearchLimit') || '12', 10);
            const select = parseInt(getStepOpt('imageSearchSelect') || '1', 10);
            const queryCount = parseInt(getStepOpt('imageSearchQueryCount') || '3', 10);
            const spriteSize = parseInt(getStepOpt('imageSearchSpriteSize') || '4', 10);

            if (query || imageQueryConfig) {
                return {
                    query,
                    queryConfig: imageQueryConfig,
                    selectConfig: imageSelectConfig,
                    limit,
                    select,
                    queryCount,
                    spriteSize
                };
            }
            return undefined;
        })();

        steps.push({
            stepIndex: i,
            modelConfig: baseModel,
            
            outputPath: getStepOpt('output'),
            outputColumn: getStepOpt('outputColumn'),
            outputTemplate: getStepOpt('output'), // Alias
            
            schemaPath: options[`jsonSchema${i}`] ? String(options[`jsonSchema${i}`]) : (options.schema ? String(options.schema) : undefined),
            verifyCommand: getStepOpt('verifyCommand'),
            postProcessCommand: getStepOpt('command'), // --command -> command1 -> postProcessCommand
            
            candidates: parseInt(getStepOpt('candidates') || '1', 10),
            noCandidateCommand: !!(options[`skipCandidateCommand${i}`] || options.skipCandidateCommand),
            
            judge,
            feedback,
            feedbackLoops: parseInt(getStepOpt('feedbackLoops') || '0', 10),
            
            imageSearch,
            aspectRatio: getStepOpt('aspectRatio')
        });
    }

    return {
        dataFilePath,
        global: {
            concurrency: parseInt(String(options.concurrency || '20'), 10),
            taskConcurrency: parseInt(String(options.taskConcurrency || '100'), 10),
            tmpDir: String(options.tmpDir || '.tmp'),
            dataOutputPath: options.dataOutput ? String(options.dataOutput) : undefined
        },
        steps
    };
});
