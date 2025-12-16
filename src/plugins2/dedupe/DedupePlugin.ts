import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    CLIOptionDefinition
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/schema.js';
import { DEFAULT_OUTPUT } from '../../config/defaults.js';

// =============================================================================
// Config Schema
// =============================================================================

export const DedupeConfigSchema = z.object({
    type: z.literal('dedupe'),
    id: z.string().optional(),
    output: OutputConfigSchema.optional(),
    key: z.string()
});

export type DedupeRawConfig = z.infer<typeof DedupeConfigSchema>;

export interface DedupeResolvedConfig {
    type: 'dedupe';
    id: string;
    output: ResolvedOutputConfig;
    keyTemplate: string;
}

// =============================================================================
// Plugin (Stateless - state managed externally)
// =============================================================================

// Global deduplication state - shared across all instances
const globalSeenKeys = new Map<string, Set<string>>();

export class DedupePlugin implements Plugin<DedupeRawConfig, DedupeResolvedConfig> {
    readonly type = 'dedupe';
    readonly configSchema = DedupeConfigSchema;

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--dedupe-key <template>', description: 'Deduplication key (Handlebars template)' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): DedupeRawConfig | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const key = getOpt('dedupeKey');
        if (!key) return null;

        return {
            type: 'dedupe',
            key
        };
    }

    async resolveConfig(
        rawConfig: DedupeRawConfig,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<DedupeResolvedConfig> {
        return {
            type: 'dedupe',
            id: rawConfig.id ?? `dedupe-${Date.now()}`,
            output: {
                mode: rawConfig.output?.mode ?? DEFAULT_OUTPUT.mode,
                column: rawConfig.output?.column,
                explode: rawConfig.output?.explode ?? DEFAULT_OUTPUT.explode
            },
            keyTemplate: rawConfig.key
        };
    }

    async execute(
        config: DedupeResolvedConfig,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        const { row } = context;

        // Render key from template
        const template = Handlebars.compile(config.keyTemplate, { noEscape: true });
        const key = template(row);

        // Get or create set for this plugin instance
        if (!globalSeenKeys.has(config.id)) {
            globalSeenKeys.set(config.id, new Set());
        }
        const seenKeys = globalSeenKeys.get(config.id)!;

        if (seenKeys.has(key)) {
            console.log(`[Dedupe] ❌ Dropping duplicate: "${key}"`);
            return { packets: [] };
        }

        console.log(`[Dedupe] ✅ Keeping: "${key}"`);
        seenKeys.add(key);

        return {
            packets: [{
                data: {},
                contentParts: []
            }]
        };
    }

    /**
     * Reset deduplication state (useful for testing)
     */
    static resetState(): void {
        globalSeenKeys.clear();
    }
}
