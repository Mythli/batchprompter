import { Command, Option } from 'commander';
import { ModelConfig } from '../types.js';
import { CLIOptionDefinition } from '../plugins/types.js';

export interface ModelFlagOptions {
    includePrompt?: boolean; // Registers --{ns}-prompt
    includeSystem?: boolean; // Registers --{ns}-system
    defaultModel?: string;
}

export class ModelFlags {
    private defaultModel?: string;

    constructor(defaultModel?: string) {
        this.defaultModel = defaultModel;
    }

    /**
     * Returns CLI option definitions for a model configuration.
     * Plugins can spread this into their cliOptions array.
     * 
     * @param namespace Prefix for flags (e.g., "image-query" produces --image-query-model)
     * @param options Configuration for which flags to include
     */
    static getOptions(namespace: string, options: ModelFlagOptions = {}): CLIOptionDefinition[] {
        const prefix = namespace ? `${namespace}-` : '';
        const descPrefix = namespace ? `${namespace} ` : '';

        const opts: CLIOptionDefinition[] = [
            { flags: `--${prefix}model <model>`, description: `Model for ${descPrefix}generation` },
            { flags: `--${prefix}temperature <number>`, description: `Temperature for ${descPrefix}model`, parser: parseFloat },
            { flags: `--${prefix}thinking-level <level>`, description: `Reasoning effort for ${descPrefix}model (low/medium/high)` }
        ];

        if (options.includePrompt) {
            opts.push({ flags: `--${prefix}prompt <text>`, description: `Prompt for ${descPrefix}(file path or text)` });
        }

        if (options.includeSystem) {
            opts.push({ flags: `--${prefix}system <file>`, description: `System prompt for ${descPrefix}(file path or text)` });
        }

        return opts;
    }

    /**
     * Registers model-related flags for a specific namespace.
     * Static because it's used during CLI setup before config is loaded.
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
     * Uses the instance's defaultModel if no specific model is found.
     * 
     * Fallback order for inheritable settings (model, temperature, thinking-level):
     * 1. Specific namespace (e.g., `--website-navigator-1-thinking-level`)
     * 2. Fallback namespace (e.g., `--website-navigator-thinking-level`)
     * 3. Global namespace (e.g., `--thinking-level`)
     * 
     * Non-inheritable settings (prompt, system) only check specific and fallback namespaces.
     */
    extract(
        options: Record<string, any>, 
        namespace: string, 
        fallbackNamespace?: string
    ): Partial<ModelConfig> {
        
        const toCamel = (s: string) => {
            return s.replace(/-([a-z0-9])/g, (g) => g[1].toUpperCase());
        };

        const getKey = (ns: string, suffix: string) => {
            // Always camelCase the result since Commander.js converts --kebab-case to camelCase
            if (!ns) return toCamel(suffix);
            return toCamel(`${ns}-${suffix}`);
        };

        // Settings that should inherit from global if not set at more specific levels
        // This allows --thinking-level and --temperature to cascade to all plugin models
        const inheritableSettings = new Set(['model', 'temperature', 'thinking-level']);

        const getVal = (suffix: string) => {
            // 1. Try specific namespace
            const specificKey = getKey(namespace, suffix);
            if (options[specificKey] !== undefined) return options[specificKey];

            // 2. Try fallback namespace
            if (fallbackNamespace !== undefined) {
                const fallbackKey = getKey(fallbackNamespace, suffix);
                if (options[fallbackKey] !== undefined) return options[fallbackKey];
            }

            // 3. For inheritable settings, try global namespace (empty string)
            // Skip this if we're already checking global (namespace is '' or fallbackNamespace is '')
            if (inheritableSettings.has(suffix) && namespace !== '' && fallbackNamespace !== '') {
                const globalKey = getKey('', suffix);
                if (options[globalKey] !== undefined) return options[globalKey];
            }

            return undefined;
        };

        const config: Partial<ModelConfig> = {};

        const model = getVal('model');
        if (model) {
            config.model = model;
        } else if (this.defaultModel) {
            config.model = this.defaultModel;
        }

        const temp = getVal('temperature');
        if (temp !== undefined) config.temperature = temp;

        const think = getVal('thinking-level');
        if (think) config.thinkingLevel = think;

        const system = getVal('system');
        if (system) config.systemSource = system;

        const prompt = getVal('prompt');
        if (prompt) config.promptSource = prompt;

        return config;
    }

    /**
     * Helper to extract model config from options using the plugin's step-suffix pattern.
     * This handles the pattern where step index goes at the END: --image-query-model-1
     * 
     * @param options Parsed CLI options
     * @param prefix The camelCase prefix (e.g., 'imageQuery')
     * @param stepIndex The step index
     * @param globalOptions Global options for fallback (model, temperature, thinkingLevel)
     */
    static extractPluginModel(
        options: Record<string, any>,
        prefix: string,
        stepIndex: number,
        globalOptions?: { model?: string; temperature?: number; thinkingLevel?: string }
    ): { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high'; prompt?: string; system?: string } {
        const getOpt = (suffix: string) => {
            // Capitalize first letter of suffix for proper camelCase
            const capSuffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
            const stepKey = `${prefix}${capSuffix}${stepIndex}`;
            const globalKey = `${prefix}${capSuffix}`;
            return options[stepKey] ?? options[globalKey];
        };

        const result: { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high'; prompt?: string; system?: string } = {};

        // Model: plugin-specific -> step global -> global
        const model = getOpt('model');
        if (model) {
            result.model = model;
        } else if (options[`model${stepIndex}`]) {
            result.model = options[`model${stepIndex}`];
        } else if (options.model) {
            result.model = options.model;
        } else if (globalOptions?.model) {
            result.model = globalOptions.model;
        }

        // Temperature: plugin-specific -> step global -> global
        const temp = getOpt('temperature');
        if (temp !== undefined) {
            result.temperature = temp;
        } else if (options[`temperature${stepIndex}`] !== undefined) {
            result.temperature = options[`temperature${stepIndex}`];
        } else if (options.temperature !== undefined) {
            result.temperature = options.temperature;
        } else if (globalOptions?.temperature !== undefined) {
            result.temperature = globalOptions.temperature;
        }

        // ThinkingLevel: plugin-specific -> step global -> global
        const think = getOpt('thinkingLevel');
        if (think) {
            result.thinkingLevel = think;
        } else if (options[`thinkingLevel${stepIndex}`]) {
            result.thinkingLevel = options[`thinkingLevel${stepIndex}`];
        } else if (options.thinkingLevel) {
            result.thinkingLevel = options.thinkingLevel;
        } else if (globalOptions?.thinkingLevel) {
            result.thinkingLevel = globalOptions.thinkingLevel as 'low' | 'medium' | 'high';
        }

        // Prompt: plugin-specific only (no global fallback for prompts)
        const prompt = getOpt('prompt');
        if (prompt) result.prompt = prompt;

        // System: plugin-specific only
        const system = getOpt('system');
        if (system) result.system = system;

        return result;
    }
}
