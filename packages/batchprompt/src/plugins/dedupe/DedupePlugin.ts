import { z } from 'zod';
import Handlebars from 'handlebars';
import {
    BasePlugin,
    BasePluginRow
} from '../types.js';
import { StepRow } from '../../StepRow.js';
import { PartialOutputConfigSchema, StepConfig } from '../../config/schema.js';
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
 * The seen keys are stored per-plugin-instance, so duplicates are tracked
 * across all rows processed by the same step.
 */
export class DedupePlugin extends BasePlugin<DedupeConfig, DedupeConfig> {
    readonly type = 'dedupe';
    
    /**
     * Shared state for tracking seen keys.
     * Maps plugin instance ID to Set of seen keys.
     */
    private seenKeysMap = new Map<string, Set<string>>();

    getSchema() {
        return DedupeConfigSchema;
    }

    normalizeConfig(config: DedupeConfig, stepConfig: StepConfig): DedupeConfig {
        const base = super.normalizeConfig(config, stepConfig);
        const id = config.id ?? `dedupe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Initialize seen keys set for this instance
        if (!this.seenKeysMap.has(id)) {
            this.seenKeysMap.set(id, new Set());
        }

        return {
            ...base,
            id,
        };
    }

    async hydrate(_stepConfig: StepConfig, config: DedupeConfig, context: Record<string, any>): Promise<DedupeConfig & { _renderedKey: string }> {
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
    hasSeenKey(instanceId: string, key: string): boolean {
        const seenKeys = this.seenKeysMap.get(instanceId);
        return seenKeys?.has(key) ?? false;
    }

    /**
     * Mark a key as seen
     */
    markKeySeen(instanceId: string, key: string): void {
        const seenKeys = this.seenKeysMap.get(instanceId);
        if (seenKeys) {
            seenKeys.add(key);
        }
    }

    /**
     * Clear seen keys for an instance (useful for testing)
     */
    clearSeenKeys(instanceId: string): void {
        this.seenKeysMap.delete(instanceId);
    }

    createRow(stepRow: StepRow, config: DedupeConfig): BasePluginRow<DedupeConfig> {
        return new DedupePluginRow(stepRow, config, this);
    }
}
