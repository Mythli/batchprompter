import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { setupTestEnvironment } from '../utils/testUtils.js';
import { BasePlugin, BasePluginRow, PluginResult } from '../../src/plugins/types.js';
import { StepRow } from '../../src/StepRow.js';

const DelayedExplodeConfigSchema = z.object({
    type: z.literal('delayedExplode'),
    output: z.any().optional()
});

type DelayedExplodeBaseConfig = z.infer<typeof DelayedExplodeConfigSchema>;
type DelayedExplodeConfig = DelayedExplodeBaseConfig & {
    output: any;
};

class DelayedExplodePluginRow extends BasePluginRow<DelayedExplodeConfig> {
    async prepare(): Promise<PluginResult> {
        const delayMs = Number(this.stepRow.context.delayMs || 0);
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        return {
            history: await this.stepRow.getPreparedMessages(),
            items: [0, 1].map(candidate => ({
                data: { candidate },
                contentParts: []
            }))
        };
    }

    async postProcess(): Promise<PluginResult> {
        return {
            history: await this.stepRow.getPreparedMessages(),
            items: [{
                data: {
                    candidate: this.stepRow.context.candidate,
                    processed: true
                },
                contentParts: []
            }]
        };
    }
}

class DelayedExplodePlugin extends BasePlugin<DelayedExplodeBaseConfig, DelayedExplodeConfig> {
    readonly type = 'delayedExplode';

    getSchema() {
        return DelayedExplodeConfigSchema;
    }

    createRow(stepRow: StepRow, config: DelayedExplodeConfig) {
        return new DelayedExplodePluginRow(stepRow, config);
    }
}

describe('exploded task timeout', () => {
    it('starts the timeout when each queued branch begins executing', async () => {
        const { executor } = setupTestEnvironment({
            plugins: [new DelayedExplodePlugin()]
        });

        const config = {
            taskConcurrency: 1,
            timeout: 1,
            steps: [
                {
                    plugins: [
                        {
                            type: 'delayedExplode',
                            output: {
                                mode: 'merge',
                                explode: true
                            }
                        }
                    ]
                }
            ]
        };

        // The first row's exploded branches wait behind the second row. The second
        // row deliberately occupies the only task slot longer than the one-second
        // timeout. Waiting must not cause either row's branches to expire.
        const { results } = await executor.runConfig(config, [
            { id: 'first', delayMs: 0 },
            { id: 'blocking', delayMs: 1_100 }
        ]);

        expect(results).toHaveLength(4);
        expect(results.every(row => row.delayedExplode.processed === true)).toBe(true);
        expect(results.map(row => `${row.id}-${row.delayedExplode.candidate}`).sort()).toEqual([
            'blocking-0',
            'blocking-1',
            'first-0',
            'first-1'
        ]);
    });
});
