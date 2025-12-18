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

// =============================================================================
// Config Schema
// =============================================================================

export const DedupeConfigSchemaV2 = z.object({
    type: z.literal('dedupe'),
    id: z.string().optional(),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }),
    key: z.string()
});

export type DedupeRawConfigV2 = z.infer<typeof DedupeConfigSchemaV2>;

export interface DedupeResolvedConfigV2 {
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

export class DedupePluginV2 implements Plugin<DedupeRawConfigV2, DedupeResolvedConfigV2> {
    readonly type = 'dedupe';
    readonly configSchema = DedupeConfigSchemaV2;

    readonly cliOptions: CLIOptionDefinition[] = [
        { flags: '--dedupe-key <template>', description: 'Deduplication key (Handlebars template)' }
    ];

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(options: Record<string, any>, stepIndex: number): DedupeRawConfigV2 | null {
        const getOpt = (key: string) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };

        const key = getOpt('dedupeKey');
        if (!key) return null;

        // Construct partial config and let Zod handle defaults
        const partialConfig = {
            type: 'dedupe',
            key,
            output: {
                mode: 'ignore',
                explode: false
            }
        };

        return this.configSchema.parse(partialConfig);
    }

    async resolveConfig(
        rawConfig: DedupeRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
    ): Promise<DedupeResolvedConfigV2> {
        return {
            type: 'dedupe',
            id: rawConfig.id ?? `dedupe-${Date.now()}`,
            output: {
                mode: rawConfig.output.mode,
                column: rawConfig.output.column,
                explode: rawConfig.output.explode
            },
            keyTemplate: rawConfig.key
        };
    }

    async execute(
        config: DedupeResolvedConfigV2,
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
