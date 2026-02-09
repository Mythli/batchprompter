import { PipelineItem } from './types.js';
import { Step } from './Step.js';
import { BatchPromptDeps } from './getDiContainer.js';
import { GlobalConfig, StepSchema } from "./config/schema.js";
import type { StepRow, StageDescriptor } from './StepRow.js';

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

            /**
             * Enqueues a single completed item for the next step, or emits row:end
             * if all steps are done. Uses priority = stepIndex for depth-first scheduling.
             */
            const enqueueNext = (item: PipelineItem, nextStepIndex: number) => {
                if (nextStepIndex >= this.steps.length) {
                    events.emit('row:end', { index: item.originalIndex, result: item.row });
                } else {
                    queue.add(
                        () => processTask({ item, stepIndex: nextStepIndex }),
                        { priority: nextStepIndex }
                    );
                }
            };

            /**
             * Processes a StepRow through its remaining stages.
             * 
             * For each stage:
             * - Single result → continues inline to next stage (no queue overhead)
             * - Multiple results (explosion) → enqueues each branch through the task queue
             * - Zero results (dropped) → returns without further processing
             * 
             * This ensures explosion branches are proper queue citizens with
             * depth-first priority, backpressure, and concurrency control.
             */
            const processStepRow = async (
                stepRow: StepRow,
                stepIndex: number,
                stages: StageDescriptor[],
                currentStage: number,
                deadline: number
            ) => {
                for (let i = currentStage; i < stages.length; i++) {
                    // Check timeout at each stage boundary
                    if (Date.now() > deadline) {
                        const step = this.steps[stepIndex];
                        throw new Error(`Step timed out after ${step.config.timeout || 180}s`);
                    }

                    const resultRows = await stepRow.executeStage(stages[i]);

                    if (resultRows.length === 0) {
                        // Row dropped (e.g., by dedupe or validation)
                        return;
                    }

                    if (resultRows.length === 1) {
                        // Single result — continue inline to next stage
                        stepRow = resultRows[0];
                        continue;
                    }

                    // Multiple results (explosion) — enqueue each for remaining stages
                    // Each branch becomes an independent task in the queue with
                    // priority = stepIndex for depth-first scheduling
                    for (const row of resultRows) {
                        queue.add(
                            () => processStepRowSafe(row, stepIndex, stages, i + 1, deadline),
                            { priority: stepIndex }
                        );
                    }
                    return; // This branch is done; sub-branches continue through queue
                }

                // All stages complete for this branch — enqueue for next step
                const item = stepRow.toPipelineItem();
                events.emit('step:finish', { row: item.originalIndex, step: stepIndex + 1, result: 1 });
                enqueueNext(item, stepIndex + 1);
            };

            /**
             * Error-handling wrapper for processStepRow.
             * Used for queued sub-tasks (explosion branches) which don't have
             * an outer try/catch from processTask.
             */
            const processStepRowSafe = async (
                stepRow: StepRow,
                stepIndex: number,
                stages: StageDescriptor[],
                currentStage: number,
                deadline: number
            ) => {
                try {
                    await processStepRow(stepRow, stepIndex, stages, currentStage, deadline);
                } catch (err: any) {
                    const originalIndex = stepRow.getOriginalIndex();
                    events.emit('row:error', { index: originalIndex, error: err });
                    events.emit('step:progress', {
                        row: originalIndex,
                        step: stepIndex + 1,
                        type: 'error',
                        message: `Step ${stepIndex + 1} Error: ${err.message}`,
                        data: err
                    });
                }
            };

            /**
             * Top-level task handler. Creates a StepRow, builds stages, and
             * begins processing through processStepRow.
             */
            const processTask = async (payload: { item: PipelineItem; stepIndex: number }) => {
                const { item, stepIndex } = payload;
                const step = this.steps[stepIndex];
                const stepNum = stepIndex + 1;
                const timeoutMs = (step.config.timeout || 180) * 1000;
                const deadline = Date.now() + timeoutMs;

                events.emit('step:start', { row: item.originalIndex, step: stepNum });

                try {
                    // --- Phase 1: Hydrate config and create row ---
                    const stepRow = await step.createRow(item);
                    const stages = step.buildStages(stepRow.config);

                    // --- Phase 2: Process stages ---
                    // Inline for single results, queue for explosions
                    await processStepRow(stepRow, stepIndex, stages, 0, deadline);

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
                queue.add(
                    () => processTask({ item: initialItem, stepIndex: 0 }),
                    { priority: 0 }
                );
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
