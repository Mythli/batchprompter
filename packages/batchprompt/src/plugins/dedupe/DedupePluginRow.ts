import { BasePluginRow, PluginResult } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { DedupeConfig, DedupePlugin } from './DedupePlugin.js';

type HydratedDedupeConfig = DedupeConfig & { _renderedKey: string };

export class DedupePluginRow extends BasePluginRow<HydratedDedupeConfig> {
    constructor(
        stepRow: StepRow,
        config: HydratedDedupeConfig,
        private plugin: DedupePlugin
    ) {
        super(stepRow, config);
    }

    /**
     * Dedupe happens in prepare - before any LLM calls
     */
    async prepare(): Promise<PluginResult> {
        const { stepRow, config, plugin } = this;
        const events = stepRow.getEvents();
        const rowIndex = stepRow.getOriginalIndex();
        const stepIndex = stepRow.step.stepIndex;
        
        const key = config._renderedKey;
        const instanceId = config.id!;

        const history = await stepRow.getPreparedMessages();

        // Check if this key has been seen before
        if (plugin.hasSeenKey(instanceId, key)) {
            // Duplicate found - emit event and drop row
            events.emit('plugin:event', {
                row: rowIndex,
                step: stepIndex,
                plugin: 'dedupe',
                event: 'duplicate:found',
                data: { key, instanceId }
            });

            events.emit('step:progress', {
                row: rowIndex,
                step: stepIndex + 1,
                type: 'info',
                message: `Dropping duplicate: "${key}"`
            });

            // Return empty items to drop the row
            return {
                history,
                items: []
            };
        }

        // New key - mark as seen and continue
        plugin.markKeySeen(instanceId, key);

        events.emit('plugin:event', {
            row: rowIndex,
            step: stepIndex,
            plugin: 'dedupe',
            event: 'duplicate:kept',
            data: { key, instanceId }
        });

        // Pass through
        return {
            history,
            items: [{ data: null, contentParts: [] }]
        };
    }
}
