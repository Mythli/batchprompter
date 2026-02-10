import { Command, Option } from 'commander';

export interface ModelFlagOptions {
    includePrompt?: boolean;
    includeSystem?: boolean;
    defaultModel?: string;
}

/**
 * Utility for registering model-related CLI flags.
 * Only static methods are used — no instance needed.
 */
export class ModelFlags {
    /**
     * Registers model-related flags for a specific namespace.
     *
     * @param program The Commander instance
     * @param namespace Prefix for flags (e.g., "judge", "feedback"). Empty string for main.
     * @param options Configuration for which flags to include
     */
    static register(program: Command, namespace: string, options: ModelFlagOptions = {}) {
        const prefix = namespace ? `${namespace}-` : '';
        const descPrefix = namespace ? `${namespace} ` : '';

        program.option(`--${prefix}model <model>`, `Model to use for ${descPrefix}generation`, options.defaultModel);
        program.option(`--${prefix}temperature <number>`, `Temperature for ${descPrefix}model`, parseFloat);
        program.addOption(new Option(`--${prefix}thinking-level <level>`, `Reasoning effort for ${descPrefix}model`)
            .choices(['low', 'medium', 'high']));

        if (options.includePrompt) {
            program.option(`--${prefix}prompt <text>`, `Instruction prompt for ${descPrefix}(File path or raw text)`);
        }

        if (options.includeSystem) {
            program.option(`--${prefix}system <file>`, `System prompt for ${descPrefix}(File path or raw text)`);
        }
    }
}
