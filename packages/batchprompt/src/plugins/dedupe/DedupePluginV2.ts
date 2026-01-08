import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import {
    Plugin
} from '../types.js';
import { Step } from '../../core/Step.js';
import { StepRow } from '../../core/StepRow.js';
import { ResolvedOutputConfig } from '../../config/types.js';
import { OutputConfigSchema, DEFAULT_PLUGIN_OUTPUT } from '../../config/schemas/index.js';
import { zHandlebars } from '../../config/validationRules.js';
import { PluginScope } from '../PluginScope.js';

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

// =============================================================================
// Plugin (Stateless - state managed externally)
// =============================================================================

// Global deduplication state - shared across all instances
const globalSeenKeys = new Map<string, Set<string>>();

export class SkipRowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SkipRowError';
    }
}

export class DedupePluginV2 implements Plugin<DedupeRawConfigV2, DedupeResolvedConfigV2> {
    readonly type = 'dedupe';
    readonly configSchema = DedupeConfigSchemaV2;
    public readonly events = new EventEmitter();

    async init(step: Step, rawConfig: DedupeRawConfigV2): Promise<DedupeResolvedConfigV2> {
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

    async prepare(stepRow: StepRow, config: DedupeResolvedConfigV2): Promise<void> {
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

        const template = Handlebars.compile(config.keyTemplate, { noEscape: true });
        const key = template(context);

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

            // Throw special error to skip this row
            throw new SkipRowError(`Duplicate key found: ${key}`);
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
    }

    static resetState(): void {
        globalSeenKeys.clear();
    }
}
