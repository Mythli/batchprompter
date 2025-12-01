import { Command, Option } from 'commander';
import { ModelConfig } from '../types.js';

export interface ModelFlagOptions {
    includePrompt?: boolean; // Registers --{ns}-prompt
    includeSystem?: boolean; // Registers --{ns}-system
    defaultModel?: string;
}

export class ModelFlags {
    /**
     * Registers model-related flags for a specific namespace.
     * 
     * @param program The Commander instance
     * @param namespace Prefix for flags (e.g., "judge", "feedback", "judge-1"). Empty string for main.
     * @param options Configuration for which flags to include
     */
    static register(program: Command, namespace: string, options: ModelFlagOptions = {}) {
        const prefix = namespace ? `${namespace}-` : '';
        const descPrefix = namespace ? `${namespace} ` : '';

        // Model
        program.option(`--${prefix}model <model>`, `Model to use for ${descPrefix}generation`, options.defaultModel);

        // Temperature
        program.option(`--${prefix}temperature <number>`, `Temperature for ${descPrefix}model`, parseFloat);

        // Thinking Level (Reasoning Effort)
        program.addOption(new Option(`--${prefix}thinking-level <level>`, `Reasoning effort for ${descPrefix}model (o1/o3)`)
            .choices(['low', 'medium', 'high']));

        // Prompt (Optional)
        if (options.includePrompt) {
            program.option(`--${prefix}prompt <text>`, `Instruction prompt for ${descPrefix} (File path or raw text)`);
        }

        // System (Optional)
        if (options.includeSystem) {
            program.option(`--${prefix}system <file>`, `System prompt for ${descPrefix} (File path or raw text)`);
        }
    }

    /**
     * Extracts model configuration from the parsed options object.
     */
    static extract(options: Record<string, any>, namespace: string): Partial<ModelConfig> {
        // Commander converts "judge-model" to "judgeModel"
        // "judge-1-model" to "judge1Model" (if defined that way) or we need to handle the keys carefully.
        // Commander camelCases flags. --judge-model -> judgeModel. --judge-1-model -> judge1Model.
        
        const toCamel = (s: string) => {
            return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
        };

        const getKey = (suffix: string) => {
            if (!namespace) return suffix;
            return toCamel(`${namespace}-${suffix}`);
        };

        const config: Partial<ModelConfig> = {};

        const modelKey = getKey('model');
        if (options[modelKey]) config.model = options[modelKey];

        const tempKey = getKey('temperature');
        if (options[tempKey] !== undefined) config.temperature = options[tempKey];

        const thinkKey = getKey('thinking-level');
        if (options[thinkKey]) config.thinkingLevel = options[thinkKey];

        const systemKey = getKey('system');
        if (options[systemKey]) config.systemSource = options[systemKey];

        const promptKey = getKey('prompt');
        if (options[promptKey]) config.promptSource = options[promptKey];

        return config;
    }
}
