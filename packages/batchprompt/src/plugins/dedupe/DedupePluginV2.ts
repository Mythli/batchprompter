import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult
} from '../types.js';
import { ServiceCapabilities, ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema } from '../../config/common.js';
import { ContentResolver } from '../../core/io/ContentResolver.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';

// =============================================================================
// Config Schema
// =============================================================================

export const DedupeConfigSchemaV2 = z.object({
    type: z.literal('dedupe').describe("Identifies this as a Dedupe plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    }).describe("How to save deduplication results."),
    key: zHandlebars.describe("Deduplication key (Handlebars template). Items with the same key are dropped.")
}).describe("Configuration for the Dedupe plugin.");

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
    public readonly events = new EventEmitter();

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    async resolveConfig(
        rawConfig: DedupeRawConfigV2,
        row: Record<string, any>,
        inheritedModel: { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
        contentResolver: ContentResolver
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
        const scope = new PluginScope(context, this.type);

        const template = Handlebars.compile(config.keyTemplate, { noEscape: true });
        const key = template(row);

        if (!globalSeenKeys.has(config.id)) {
            globalSeenKeys.set(config.id, new Set());
        }
        const seenKeys = globalSeenKeys.get(config.id)!;

        if (seenKeys.has(key)) {
            scope.emit('duplicate:found', { key });
            
            scope.artifact({
                type: 'json',
                filename: `dedupe/dedupe_${Date.now()}.json`,
                content: JSON.stringify({
                    id: config.id,
                    key,
                    isDuplicate: true
                }, null, 2),
                tags: ['debug', 'dedupe', 'duplicate']
            });

            return { packets: [] };
        }

        scope.emit('duplicate:kept', { key });
        seenKeys.add(key);

        scope.artifact({
            type: 'json',
            filename: `dedupe/dedupe_${Date.now()}.json`,
            content: JSON.stringify({
                id: config.id,
                key,
                isDuplicate: false
            }, null, 2),
            tags: ['debug', 'dedupe', 'kept']
        });

        return {
            packets: [{
                data: {},
                contentParts: []
            }]
        };
    }

    static resetState(): void {
        globalSeenKeys.clear();
    }
}
