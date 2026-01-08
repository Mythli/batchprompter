import { RuntimeConfig, PipelineItem, GlobalContext } from './types.js';
import { Pipeline } from './core/Pipeline.js';

interface TaskPayload {
    item: PipelineItem;
    stepIndex: number;
}

export class ActionRunner {
    constructor(
        private globalContext: GlobalContext
    ) {}

    async run(config: RuntimeConfig) {
        const { concurrency, taskConcurrency, data, steps, offset = 0, limit } = config;
        const events = this.globalContext.events;

        events.emit('run:start', config);
        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)` });

        this.globalContext.taskQueue.concurrency = taskConcurrency;
        this.globalContext.gptQueue.concurrency = concurrency;

        // --- Phase 1: Compilation (The Pipeline Level) ---
        const pipeline = new Pipeline(steps, this.globalContext);
        await pipeline.init();
        
        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Initialized ${pipeline.steps.length} steps.` });

        const endIndex = limit ? offset + limit : undefined;
        const dataToProcess = data.slice(offset, endIndex);

        events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Processing ${dataToProcess.length} rows.` });

        const queue = this.globalContext.taskQueue;

        const enqueueNext = (items: PipelineItem[], nextStepIndex: number) => {
            if (nextStepIndex >= pipeline.steps.length) {
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
            const step = pipeline.steps[stepIndex];
            const stepNum = stepIndex + 1;
            const timeoutMs = (step.config.timeout || 180) * 1000;

            events.emit('step:start', { row: item.originalIndex, step: stepNum });

            try {
                // Execute with Timeout
                let timer: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Step timed out after ${step.config.timeout || 180}s`)), timeoutMs);
                });

                // --- Phase 2: Processing (The StepRow Level) ---
                const stepRow = step.createRow(item);
                const executionPromise = stepRow.run();

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
