import { RuntimeConfig, PipelineItem, GlobalContext } from './types.js';
import { StepOrchestrator } from './core/StepOrchestrator.js';
import { PluginServices } from './plugins/types.js';

interface TaskPayload {
    item: PipelineItem;
    stepIndex: number;
}

export class ActionRunner {
    constructor(
        private globalContext: GlobalContext,
        private stepOrchestrator: StepOrchestrator
    ) {}

    async run(config: RuntimeConfig) {
        const { concurrency, taskConcurrency, data, steps, offset = 0, limit } = config;
        const events = this.globalContext.events;

        events.emit('run:start', config);
        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)` });

        this.globalContext.taskQueue.concurrency = taskConcurrency;
        this.globalContext.gptQueue.concurrency = concurrency;

        const endIndex = limit ? offset + limit : undefined;
        const dataToProcess = data.slice(offset, endIndex);

        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Processing ${dataToProcess.length} rows.` });

        const queue = this.globalContext.taskQueue;

        const pluginServices: PluginServices = {
            puppeteerHelper: this.globalContext.puppeteerHelper,
            puppeteerQueue: this.globalContext.puppeteerQueue,
            fetcher: this.globalContext.fetcher,
            cache: this.globalContext.cache,
            imageSearch: this.globalContext.imageSearch,
            webSearch: this.globalContext.webSearch,
        };

        const enqueueNext = (items: PipelineItem[], nextStepIndex: number) => {
            if (nextStepIndex >= steps.length) {
                for (const item of items) {
                    events.emit('row:end', { index: item.originalIndex, result: item.row });
                }
            } else {
                for (const item of items) {
                    queue.add(() => processTask({ item, stepIndex: nextStepIndex }));
                }
            }
        };

        const processTask = async (payload: TaskPayload) => {
            const { item, stepIndex } = payload;
            const stepConfig = steps[stepIndex];
            const stepNum = stepIndex + 1;
            // timeout is guaranteed to be a number after resolveStep
            const timeoutMs = stepConfig.timeout * 1000;

            events.emit('step:start', { row: item.originalIndex, step: stepNum });

            try {
                // Execute with Timeout
                let timer: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Step timed out after ${stepConfig.timeout}s`)), timeoutMs);
                });

                const executionPromise = this.stepOrchestrator.processStep(
                    item,
                    stepIndex,
                    stepConfig,
                    config.tmpDir,
                    pluginServices
                );

                const nextItems = await Promise.race([executionPromise, timeoutPromise]);
                clearTimeout(timer!);

                events.emit('step:finish', { row: item.originalIndex, step: stepNum, result: nextItems.length });
                enqueueNext(nextItems, stepIndex + 1);

            } catch (err: any) {
                events.emit('row:error', { index: item.originalIndex, error: err });
                events.emit('step:progress', {
                    row: item.originalIndex,
                    step: stepNum,
                    type: 'error',
                    message: `Step ${stepNum} Error: ${err.message}`,
                    data: err
                });
            }
        };

        for (let i = 0; i < dataToProcess.length; i++) {
            const originalIndex = offset + i;
            const initialItem: PipelineItem = {
                row: dataToProcess[i],
                workspace: {},
                stepHistory: [],
                history: [],
                originalIndex: originalIndex
            };
            events.emit('row:start', { index: originalIndex, row: initialItem.row });
            queue.add(() => processTask({ item: initialItem, stepIndex: 0 }));
        }

        await queue.onIdle();
        events.emit('run:end');
    }
}
