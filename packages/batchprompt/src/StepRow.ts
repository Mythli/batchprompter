import OpenAI from 'openai';
import path from 'path';
import { Step } from './Step.js';
import { PipelineItem } from './types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { PluginResult, PluginItem } from './plugins/types.js';
import { OutputConfig, StepConfig } from "./config/schema.js";
import { ModelConfig } from "./config/model.js";

/**
 * Describes a single processing stage within a step.
 * Steps are broken into a sequence of stages:
 *   plugin-prepare(0), plugin-prepare(1), ..., model, plugin-post(0), plugin-post(1), ...
 * 
 * This allows the Pipeline to process stages individually, enqueuing
 * explosion branches through the task queue instead of using Promise.all.
 */
export type StageDescriptor =
    | { type: 'plugin-prepare'; instance: any; config: any }
    | { type: 'model' }
    | { type: 'plugin-post'; instance: any; config: any };

/**
 * Helper to apply data to a target object based on mode/namespace/column.
 * 
 * @param target - The object to apply data to (newData or newContext)
 * @param data - The data to apply
 * @param options - Configuration for how to apply
 *   - namespace: If provided, data is stored under this key
 *   - column: If provided, data is stored under this key (column mode)
 *   - spreadObject: If true and data is a plain object, spread properties directly into target
 */
function applyDataToTarget(
    target: Record<string, any>,
    data: any,
    options: {
        namespace?: string;
        column?: string;
        spreadObject?: boolean;
    } = {}
): void {
    const { namespace, column, spreadObject = false } = options;
    const isPlainObject = typeof data === 'object' && data !== null && !Array.isArray(data);

    if (column) {
        // Column mode: store under the column key
        target[column] = data;
    } else if (namespace) {
        // Plugin output: store under namespace
        target[namespace] = data;
        // Also spread object properties if requested
        if (spreadObject && isPlainObject) {
            Object.assign(target, data);
        }
    } else {
        // Direct merge (model output): spread if data is a plain object
        if (isPlainObject) {
            Object.assign(target, data);
        }
    }
}

export interface StepRowState {
    // The persistent data record that is being processed and saved
    data: Record<string, any>;
    // The view context (workspace + data + ephemeral plugin outputs)
    context: Record<string, any>;
    // Conversation history (includes model messages, baked in at step creation)
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    // Accumulated content for the current step
    content: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    // Metadata
    originalIndex: number;
    variationIndex?: number;
    stepHistory: any[];
}

export class StepRow {
    constructor(
        public readonly step: Step,
        public readonly config: StepConfig,
        private readonly state: StepRowState
    ) {}

    // --- Getters (Read-only for plugins) ---

    get context() { return this.state.context; }
    get content() { return this.state.content; }
    get history() { return this.state.history; }

    /**
     * Returns the current accumulated row data.
     * This is the single source of truth for the row being built up across stages.
     */
    getData(): Record<string, any> {
        return this.state.data;
    }

    getEvents() {
        return this.step.deps.events;
    }

    public getOriginalIndex(): number {
        return this.state.originalIndex;
    }

    async getPlugins() {
        return this.config.plugins || [];
    }

    async getTempDir() {
        return (this.config as any).resolvedTempDir || '/tmp';
    }

    async getOutputBasename() {
        return (this.config as any).outputBasename;
    }

    async getOutputExtension() {
        return (this.config as any).outputExtension;
    }

    async getResolvedOutputDir() {
        return (this.config as any).resolvedOutputDir;
    }

    async getResolvedSchema() {
        return this.config.schema;
    }

    /**
     * Returns the complete prepared messages for LLM/plugin consumption.
     * History already includes model messages (baked in at step creation).
     * Appends accumulated content as a user message if present.
     */
    async getPreparedMessages(): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
        if (this.state.content.length > 0) {
            return [...this.state.history, { role: 'user' as const, content: this.state.content }];
        }
        return [...this.state.history];
    }

    // --- Core Logic ---

    /**
     * Executes a single stage on this row, returning the resulting StepRow(s).
     * 
     * Returns:
     * - [] : Row was dropped (e.g., by dedupe or validation)
     * - [row] : Single result, continue to next stage
     * - [row1, row2, ...] : Explosion, each row continues independently
     */
    public async executeStage(stage: StageDescriptor): Promise<StepRow[]> {
        switch (stage.type) {
            case 'plugin-prepare': {
                const namespace = stage.instance.type;
                const pluginRow = stage.instance.createRow(this, stage.config);
                const result = await pluginRow.prepare();
                return this.applyResult(result, stage.config.output, namespace);
            }
            case 'model': {
                const result = await this.executeLlm();
                
                // Emit artifact if output path is defined
                if (this.config.output?.path) {
                    const outDir = (this.config as any).resolvedOutputDir || '';
                    const baseName = (this.config as any).outputBasename || `output_${this.state.originalIndex}_${this.step.stepIndex + 1}`;
                    const ext = (this.config as any).outputExtension || '.txt';
                    
                    for (let i = 0; i < result.items.length; i++) {
                        const item = result.items[i];
                        let fileName = baseName + ext;
                        if (result.items.length > 1) {
                            fileName = `${baseName}_${i}${ext}`;
                        }
                        const fullPath = path.join(outDir, fileName);
                        
                        let content = item.data;
                        if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
                            content = JSON.stringify(content, null, 2);
                        }

                        this.getEvents().emit('artifact:emit', {
                            row: this.state.originalIndex,
                            step: this.step.stepIndex + 1,
                            source: 'core',
                            type: this.config.aspectRatio ? 'image' : (typeof item.data === 'object' ? 'json' : 'text'),
                            filename: fullPath,
                            content: content,
                            tags: ['final']
                        });
                    }
                }

                return this.applyResult(result, this.config.output);
            }
            case 'plugin-post': {
                const namespace = stage.instance.type;
                const pluginRow = stage.instance.createRow(this, stage.config);
                const result = await pluginRow.postProcess();
                return this.applyResult(result, stage.config.output, namespace);
            }
        }
    }

    /**
     * Processes all stages for this row, returning the final pipeline items.
     * 
     * Processes rows sequentially within each stage. For queue-based parallel
     * execution with proper backpressure and depth-first scheduling, use
     * Pipeline which routes explosion branches through the task queue.
     */
    async run(): Promise<PipelineItem[]> {
        let currentRows: StepRow[] = [this];
        const stages = this.step.buildStages(this.config);

        for (const stage of stages) {
            const nextRows: StepRow[] = [];
            for (const row of currentRows) {
                const results = await row.executeStage(stage);
                nextRows.push(...results);
            }
            currentRows = nextRows;
        }

        return currentRows.map(row => row.toPipelineItem());
    }

    public toPipelineItem(): PipelineItem {
        return {
            row: this.state.data, // Return the clean persistent data
            history: this.state.history,
            originalIndex: this.state.originalIndex,
            variationIndex: this.state.variationIndex,
            stepHistory: [...this.state.stepHistory],
            workspace: this.state.context
        };
    }

    /**
     * Applies a plugin result to the current row, potentially spawning new StepRow instances.
     * @param result The plugin result containing history and items
     * @param outputConfig How to handle the output (merge, column, ignore)
     * @param namespace Optional namespace for plugins. When undefined (model output), data merges directly.
     */
    public applyResult(result: PluginResult, outputConfig: OutputConfig, namespace?: string): StepRow[] {
        const { history, items } = result;

        // Filter/drop case: no items = row disappears
        if (items.length === 0) {
            return [];
        }

        // Explode case: multiple items with explode=true
        if (outputConfig.explode && items.length > 1) {
            const total = items.length;
            const offset = outputConfig.offset ?? 0;
            const limit = outputConfig.limit;

            // Apply offset and limit
            let itemsToExplode = items.slice(offset);
            if (limit !== undefined && limit > 0) {
                itemsToExplode = itemsToExplode.slice(0, limit);
            }

            const count = itemsToExplode.length;

            this.getEvents().emit('step:progress', {
                row: this.state.originalIndex,
                step: this.step.stepIndex + 1,
                type: 'explode',
                message: `Exploding ${count} items`,
                data: { total, count, limit, offset }
            });

            return itemsToExplode.map((item, idx) =>
                this.spawn(
                    item.data,
                    offset + idx,
                    outputConfig,
                    namespace,
                    history,
                    [...this.state.content, ...item.contentParts]
                )
            );
        }

        // Non-explode case: combine all items into single row
        // Data: single item uses its data directly, multiple items combine into array
        const combinedData = items.length === 1 ? items[0].data : items.map(i => i.data);

        // ContentParts: concatenate all
        const combinedContent = items.flatMap(i => i.contentParts);

        return [this.spawn(
            combinedData,
            this.state.variationIndex,
            outputConfig,
            namespace,
            history,
            [...this.state.content, ...combinedContent]
        )];
    }

    private spawn(
        data: any,
        variationIndex: number | undefined,
        outputConfig: OutputConfig,
        namespace: string | undefined,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        content: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): StepRow {
        // 1. Clone Data & Context
        const newData = JSON.parse(JSON.stringify(this.state.data));
        const newContext = { ...this.state.context };

        // 2. Skip applying null data (no-op stages should not clobber existing state)
        if (data != null) {
            // Apply to context (always, for template access)
            if (namespace) {
                applyDataToTarget(newContext, data, { namespace, spreadObject: true });
            } else {
                applyDataToTarget(newContext, data, {});
            }

            // Apply to data (based on mode)
            if (outputConfig.mode === 'merge') {
                if (namespace) {
                    applyDataToTarget(newData, data, { namespace });
                } else {
                    applyDataToTarget(newData, data, {});
                }
            } else if (outputConfig.mode === 'column' && outputConfig.column) {
                applyDataToTarget(newData, data, { column: outputConfig.column });
                applyDataToTarget(newContext, data, { column: outputConfig.column });
            }
            // mode === 'ignore': data is only in context, not persisted to row
        }

        // 3. Create New State
        const newState: StepRowState = {
            data: newData,
            context: newContext,
            history: history,
            content: content,
            originalIndex: this.state.originalIndex,
            variationIndex: variationIndex ?? this.state.variationIndex,
            stepHistory: this.state.stepHistory
        };

        // 4. Return New Row
        return new StepRow(this.step, this.config, newState);
    }

    public async executeLlm(): Promise<PluginResult> {
        // Create LLM Client using hydrated model config
        const llm = await this.createLlm(this.config.model);

        // Execution Strategy
        let strategy: GenerationStrategy = new StandardStrategy(this);
        if (this.config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this);
        }

        return await strategy.execute();
    }

    /**
     * Creates a BoundLlmClient.
     * If config is provided, it uses that. Otherwise it uses the hydrated model config.
     */
    async createLlm(config?: ModelConfig): Promise<BoundLlmClient> {
        const targetConfig = config || this.config.model;
        if (!targetConfig) {
            throw new Error('No model configuration provided and no default model config available');
        }
        return this.step.deps.llmFactory.create(targetConfig, targetConfig.messages || []);
    }

    /**
     * Helper to get a client bound to specific messages (used by CandidateStrategy/Judge)
     */
    async getBoundClient(config: ModelConfig): Promise<BoundLlmClient> {
        return this.createLlm(config);
    }
}
