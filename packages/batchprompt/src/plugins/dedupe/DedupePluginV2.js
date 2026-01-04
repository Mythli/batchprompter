import { z } from 'zod';
import Handlebars from 'handlebars';
import { EventEmitter } from 'eventemitter3';
import { OutputConfigSchema } from '../../config/common.js';
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
// =============================================================================
// Plugin (Stateless - state managed externally)
// =============================================================================
// Global deduplication state - shared across all instances
const globalSeenKeys = new Map();
export class DedupePluginV2 {
    type = 'dedupe';
    configSchema = DedupeConfigSchemaV2;
    events = new EventEmitter();
    cliOptions = [
        { flags: '--dedupe-key <template>', description: 'Deduplication key (Handlebars template)' }
    ];
    getRequiredCapabilities() {
        return [];
    }
    parseCLIOptions(options, stepIndex) {
        const getOpt = (key) => {
            const stepKey = `${key}${stepIndex}`;
            return options[stepKey] ?? options[key];
        };
        const key = getOpt('dedupeKey');
        if (!key)
            return null;
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
    async resolveConfig(rawConfig, row, inheritedModel, contentResolver) {
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
    async execute(config, context) {
        const { row } = context;
        const scope = new PluginScope(context, this.type);
        const template = Handlebars.compile(config.keyTemplate, { noEscape: true });
        const key = template(row);
        if (!globalSeenKeys.has(config.id)) {
            globalSeenKeys.set(config.id, new Set());
        }
        const seenKeys = globalSeenKeys.get(config.id);
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
    static resetState() {
        globalSeenKeys.clear();
    }
}
//# sourceMappingURL=DedupePluginV2.js.map