import { PipelineItem } from './types.js';
import { Step } from './Step.js';
import { BatchPromptDeps } from './getDiContainer.js';
import { GlobalConfig, StepSchema } from "./config/schema.js";

interface TaskPayload {
    item: PipelineItem;
    stepIndex: number;
}

export class Pipeline {
    constructor(
        private deps: BatchPromptDeps,
        private steps: Step[],
        private globalConfig: GlobalConfig
    ) {}

    async run(): Promise<{ results: any[], artifacts: any[] }> {
        const { concurrency, taskConcurrency, data, steps, offset = 0, limit } = this.globalConfig;
        const events = this.deps.events;

        // Collection arrays
        const results: any[] = [];
        const artifacts: any[] = [];

        // Event Listeners
        const onRowEnd = (payload: { index: number; result: any }) => {
            results.push(payload.result);
        };

        const onArtifact = (payload: {
            row: number;
            step: number;
            plugin: string;
            type: string;
            filename: string;
            content: string | Buffer;
            tags: string[];
            metadata?: Record<string, any>;
        }) => {
            artifacts.push({
                path: payload.filename,
                content: payload.content,
                type: payload.type,
                tags: payload.tags,
                metadata: payload.metadata
            });
        };

        events.on('row:end', onRowEnd);
        events.on('plugin:artifact', onArtifact);

        try {
            events.emit('run:start', this.globalConfig);
            events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Initializing with concurrency: ${concurrency} (LLM) / ${taskConcurrency} (Tasks)` });

            this.deps.taskQueue.concurrency = taskConcurrency;
            this.deps.gptQueue.concurrency = concurrency;

            events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Initialized ${this.steps.length} steps.` });

            const endIndex = limit ? offset + limit : undefined;
            const dataToProcess = data.slice(offset, endIndex);

            events.emit('step:progress', { row: -1, step: -1, type: 'info', message: `Processing ${dataToProcess.length} rows.` });

            const queue = this.deps.taskQueue;

            const enqueueNext = (items: PipelineItem[], nextStepIndex: number) => {
                if (nextStepIndex >= this.steps.length) {
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
                const step = this.steps[stepIndex];
                const stepNum = stepIndex + 1;
                const timeoutMs = (step.config.timeout || 180) * 1000;

                events.emit('step:start', { row: item.originalIndex, step: stepNum });

                try {
                    // Execute with Timeout
                    let timer: NodeJS.Timeout;
                    const timeoutPromise = new Promise<never>((_, reject) => {
                        timer = setTimeout(() => reject(new Error(`Step timed out after ${step.config.timeout || 180}s`)), timeoutMs);
                    });

                    // --- Phase 2: Processing ---
                    const stepRow = await step.createRow(item);
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

            return { results, artifacts };

        } finally {
            events.off('row:end', onRowEnd);
            events.off('plugin:artifact', onArtifact);
        }
    }
}
