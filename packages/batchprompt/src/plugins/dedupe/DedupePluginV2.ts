import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

// =============================================================================
// Config Schema
// =============================================================================

export const DedupeConfigSchemaV2 = z.object({
    type: z.literal('dedupe').describe("Identifies this as a Dedupe plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save deduplication results."),

    // Required
    key: zHandlebars.describe("Deduplication key (Handlebars template). Items with the same key are dropped.")
}).strict().describe("Configuration for the Dedupe plugin.");

export type DedupeRawConfigV2 = z.infer<typeof DedupeConfigSchemaV2>;

export interface DedupeResolvedConfigV2 {
    type: 'dedupe';
    id: string;
    output: ResolvedOutputConfig;
    keyTemplate: string;
}

export interface DedupeHydratedConfigV2 extends DedupeResolvedConfigV2 {
    key: string;
}

// =============================================================================
// Plugin (Stateless - state managed externally)
// =============================================================================

// Global deduplication state - shared across all instances
const globalSeenKeys = new Map<string, Set<string>>();

export class DedupePluginV2 implements Plugin<DedupeRawConfigV2, DedupeResolvedConfigV2, DedupeHydratedConfigV2> {
    readonly type = 'dedupe';
    readonly configSchema = DedupeConfigSchemaV2;
    public readonly events = new EventEmitter();

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return DedupeConfigSchemaV2.transform(config => {
            return {
                ...config,
                id: config.id ?? `dedupe-${Date.now()}`,
                keyTemplate: config.key
            };
        });
    }

    async hydrate(config: DedupeResolvedConfigV2, context: Record<string, any>): Promise<DedupeHydratedConfigV2> {
        const template = Handlebars.compile(config.keyTemplate, { noEscape: true });
        const key = template(context);
        return {
            ...config,
            key
        };
    }

    async prepare(stepRow: StepRow, config: DedupeHydratedConfigV2): Promise<PluginPacket[]> {
        const { context } = stepRow;

        const emit = (event: any, ...args: any[]) => {
            stepRow.step.globalContext.events.emit(event, ...args);
        };

        const scope = new PluginScope({
            row: context,
            stepIndex: stepRow.step.stepIndex,
            pluginIndex: 0,
            tempDirectory: stepRow.resolvedTempDir || '/tmp',
            emit: emit
        }, this.type);

        if (!globalSeenKeys.has(config.id)) {
            globalSeenKeys.set(config.id, new Set());
        }
        const seenKeys = globalSeenKeys.get(config.id)!;

        if (seenKeys.has(config.key)) {
            scope.emit('duplicate:found', { key: config.key });

            scope.artifact({
                type: 'json',
                filename: `dedupe/dedupe_${Date.now()}.json`,
                content: JSON.stringify({
                    id: config.id,
                    key: config.key,
                    isDuplicate: true
                }, null, 2),
                tags: ['debug', 'dedupe', 'duplicate']
            });

            // Return empty array to filter/drop this row
            return [];
        }

        scope.emit('duplicate:kept', { key: config.key });
        seenKeys.add(config.key);

        scope.artifact({
            type: 'json',
            filename: `dedupe/dedupe_${Date.now()}.json`,
            content: JSON.stringify({
                id: config.id,
                key: config.key,
                isDuplicate: false
            }, null, 2),
            tags: ['debug', 'dedupe', 'kept']
        });

        // Return neutral packet to continue
        return [{
            data: [null],
            contentParts: []
        }];
    }

    static resetState(): void {
        globalSeenKeys.clear();
    }
}
