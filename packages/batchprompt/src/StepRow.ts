import OpenAI from 'openai';
import { Step } from './Step.js';
import { PipelineItem } from './types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { PluginResult, PluginItem } from './plugins/types.js';
import { OutputConfig, StepConfig } from "./config/schema.js";
import { ModelConfig } from "./config/model.js";

// Helper for async flatMap
async function flatMapAsync<T, U>(array: T[], callback: (item: T) => Promise<U[]>): Promise<U[]> {
    const results = await Promise.all(array.map(callback));
    return results.flat();
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
    public lastResult: any = null;

    constructor(
        public readonly step: Step,
        public readonly config: StepConfig,
        private readonly state: StepRowState
    ) {}

    // --- Getters (Read-only for plugins) ---

    get context() { return this.state.context; }
    get content() { return this.state.content; }
    get history() { return this.state.history; }

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
        return this.config.outputBasename;
    }

    async getOutputExtension() {
        return this.config.outputExtension;
    }

    async getResolvedOutputDir() {
        return this.config.resolvedOutputDir;
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

    async run(): Promise<PipelineItem[]> {
        let currentRows: StepRow[] = [this];

        // --- Stage 1: Plugin Preparation ---
        const plugins = await this.getPlugins();
        for (const { instance, config } of plugins) {
            const namespace = instance.type;
            currentRows = await flatMapAsync(currentRows, async (row) => {
                const pluginRow = instance.createRow(row, config);
                const result = await pluginRow.prepare();
                return row.applyResult(result, config.output, namespace);
            });
        }

        // --- Stage 2: Model Execution ---
        const modelMessages = this.config.model?.messages;
        const hasMessages = modelMessages && modelMessages.length > 0;

        if (hasMessages) {
            currentRows = await flatMapAsync(currentRows, async (row) => {
                const result = await row.executeLlm();
                // No namespace for model output - it merges directly into the row
                return row.applyResult(result, this.step.config.output);
            });
        }

        // --- Stage 3: Plugin Post-Processing ---
        for (const { instance, config } of plugins) {
            const namespace = instance.type;
            currentRows = await flatMapAsync(currentRows, async (row) => {
                const pluginRow = instance.createRow(row, config);
                const result = await pluginRow.postProcess(row.lastResult);
                return row.applyResult(result, config.output, namespace);
            });
        }

        // Convert StepRows back to PipelineItems
        return currentRows.map(row => row.toPipelineItem());
    }

    public toPipelineItem(): PipelineItem {
        return {
            row: this.state.data, // Return the clean persistent data
            history: this.state.history,
            originalIndex: this.state.originalIndex,
            variationIndex: this.state.variationIndex,
            stepHistory: [...this.state.stepHistory, this.lastResult],
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

        // 2. Apply New Data based on output mode and namespace
        
        // If namespace is provided (plugin output), add to context for template access
        if (namespace) {
            newContext[namespace] = data;
        }

        if (outputConfig.mode === 'merge') {
            if (namespace) {
                // Plugin merge: namespace the plugin output under its name
                newData[namespace] = data;
                // Also spread object properties to context for easy template access
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                    Object.assign(newContext, data);
                }
            } else {
                // Model merge (no namespace): spread directly into row
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                    Object.assign(newData, data);
                    Object.assign(newContext, data);
                }
                // Note: Non-object data (string, array) can't be spread directly.
                // It will still be available via lastResult but not merged into row.
            }
        } else if (outputConfig.mode === 'column' && outputConfig.column) {
            newData[outputConfig.column] = data;
            newContext[outputConfig.column] = data;
        }
        // mode === 'ignore': data is only in context (if namespace provided), not persisted to row

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
        const newRow = new StepRow(this.step, this.config, newState);
        newRow.lastResult = data;
        return newRow;
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
        return this.step.deps.llmFactory.create(targetConfig, targetConfig.messages);
    }

    /**
     * Helper to get a client bound to specific messages (used by CandidateStrategy/Judge)
     */
    async getBoundClient(config: ModelConfig): Promise<BoundLlmClient> {
        return this.createLlm(config);
    }
}
