import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import {
    BasePlugin,
    PluginPacket
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';
import { StepBaseConfig, GlobalsConfig } from '../../config/schema.js';

export const DedupeConfigSchemaV2 = z.object({
    type: z.literal('dedupe').describe("Identifies this as a Dedupe plugin."),
    id: z.string().optional().describe("Unique ID for this plugin instance."),
    output: OutputConfigSchema.default(DEFAULT_PLUGIN_OUTPUT).describe("How to save deduplication results."),

    // Required
    key: zHandlebars.describe("Deduplication key (Handlebars template). Items with the same key are dropped.")
}).strict().describe("Configuration for the Dedupe plugin.");

export type DedupeConfig = z.output<typeof DedupeConfigSchemaV2>;

// Global deduplication state - shared across all instances
const globalSeenKeys = new Map<string, Set<string>>();

export class DedupePluginV2 extends BasePlugin<DedupeConfig> {
    readonly type = 'dedupe';
    public readonly events = new EventEmitter();

    getSchema(step: StepBaseConfig, globals: GlobalsConfig) {
        return DedupeConfigSchemaV2.transform(config => {
            return {
                ...config,
                id: config.id ?? `dedupe-${Date.now()}`,
                keyTemplate: config.key,
                key: '' // Placeholder, populated in hydrate
            };
        });
    }

    async hydrate(config: DedupeConfig, context: Record<string, any>): Promise<DedupeConfig> {
        const template = Handlebars.compile(config.keyTemplate, { noEscape: true });
        const key = template(context);
        return {
            ...config,
            key
        };
    }

    async prepare(stepRow: StepRow, config: DedupeConfig): Promise<PluginPacket[]> {
        const { context } = stepRow;

        const emit = (event: any, ...args: any[]) => {
            stepRow.step.globalContext.events.emit(event, ...args);
        };

        const scope = new PluginScope({
            row: context,
            stepIndex: stepRow.step.stepIndex,
            pluginIndex: 0,
            tempDirectory: await stepRow.getTempDir(),
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
