import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig, GlobalConfig } from '../../config/schema.js';
import { zHandlebars } from '../../config/validationRules.js';
import { DedupePluginRow } from './DedupePluginRow.js';

export const DedupeConfigSchema = z.object({
    type: z.literal('dedupe'),
    id: z.string().optional(),
    output: PartialOutputConfigSchema.optional(),
    key: zHandlebars.describe("Handlebars template to generate the dedupe key.")
}).strict();

export type DedupeConfig = z.output<typeof DedupeConfigSchema>;

/**
 * Dedupe plugin that filters out duplicate rows based on a key template.
 * The plugin is instantiated per-step, so the seen keys are naturally
 * scoped to all rows processed by that specific step.
 */
export class DedupePlugin extends BasePlugin<DedupeConfig, DedupeConfig> {
    readonly type = 'dedupe';
    
    /**
     * State for tracking seen keys.
     * Since the plugin is instantiated per-step, this is naturally scoped to the step.
     */
    private seenKeys = new Set<string>();

    getSchema() {
        return DedupeConfigSchema;
    }

    normalizeConfig(config: DedupeConfig, stepConfig: StepConfig, globalConfig: GlobalConfig): DedupeConfig {
        const base = super.normalizeConfig(config, stepConfig, globalConfig);
        const id = config.id ?? `dedupe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        return {
            ...base,
            id,
        };
    }

    async hydrate(_stepConfig: StepConfig, _globalConfig: GlobalConfig, config: DedupeConfig, context: Record<string, any>): Promise<DedupeConfig & { _renderedKey: string }> {
        // Render the key template against context
        const template = Handlebars.compile(config.key, { noEscape: true });
        const renderedKey = template(context);

        return {
            ...config,
            _renderedKey: renderedKey
        };
    }

    /**
     * Check if a key has been seen before
     */
    hasSeenKey(key: string): boolean {
        return this.seenKeys.has(key);
    }

    /**
     * Mark a key as seen
     */
    markKeySeen(key: string): void {
        this.seenKeys.add(key);
    }

    /**
     * Clear seen keys (useful for testing)
     */
    clearSeenKeys(): void {
        this.seenKeys.clear();
    }

    createRow(stepRow: StepRow, config: DedupeConfig): BasePluginRow<DedupeConfig> {
        // Cast config to include the hydrated property since we know it comes from hydrate()
        return new DedupePluginRow(stepRow, config as DedupeConfig & { _renderedKey: string }, this);
    }
}
