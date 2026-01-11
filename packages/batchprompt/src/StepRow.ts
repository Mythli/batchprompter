import OpenAI from 'openai';
import { Step } from './Step.js';
import { PipelineItem } from './types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { PluginPacket } from './plugins/types.js';
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
    // Conversation history
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

    async getPreparedMessages() {
        // Combine hydrated model messages with dynamic content and history
        const messages = [...this.state.history, ...this.config.model.messages];
        if (this.state.content.length > 0) {
            messages.push({ role: 'user', content: this.state.content });
        }
        return messages;
    }

    // --- Core Logic ---

    async run(): Promise<PipelineItem[]> {
        let currentRows: StepRow[] = [this];

        // --- Stage 1: Plugin Preparation ---
        const plugins = await this.getPlugins();
        for (const { instance, config } of plugins) {
            currentRows = await flatMapAsync(currentRows, async (row) => {
                const packets = await instance.prepare(row, config);
                return row.applyPackets(packets, config.output, instance.type);
            });
        }

        // --- Stage 2: Model Execution ---
        const hasMessages = this.config.model?.messages?.length > 0;

        if (hasMessages) {
            currentRows = await flatMapAsync(currentRows, async (row) => {
                const packets = await row.executeLlm();
                return row.applyPackets(packets, this.step.config.output, 'modelOutput');
            });
        }

        // --- Stage 3: Plugin Post-Processing ---
        for (const { instance, config } of plugins) {
            currentRows = await flatMapAsync(currentRows, async (row) => {
                const packets = await instance.postProcess(row, config, row.lastResult);
                return row.applyPackets(packets, config.output, instance.type);
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
     * Applies a list of packets to the current row, potentially spawning new StepRow instances.
     */
    public applyPackets(packets: PluginPacket[], outputConfig: OutputConfig, namespace: string): StepRow[] {
        const nextRows: StepRow[] = [];

        for (const packet of packets) {
            // 1. Update History if provided
            let nextHistory = this.state.history;
            if (packet.history) {
                nextHistory = [...packet.history];
            }

            // 2. Append Content
            let nextContent = this.state.content;
            if (packet.contentParts && packet.contentParts.length > 0) {
                nextContent = [...nextContent, ...packet.contentParts];
            }

            // 3. Handle Data (Branching/Explosion)
            const dataArray = packet.data;

            if (dataArray.length === 0) {
                // Filter/Drop: Do nothing, effectively dropping this branch
                continue;
            }

            if (outputConfig.explode && dataArray.length > 1) {
                // Explode: Spawn new rows for each item
                this.getEvents().emit('step:progress', {
                    row: this.state.originalIndex,
                    step: this.step.stepIndex + 1,
                    type: 'explode',
                    message: `Exploding ${dataArray.length} items`,
                    data: { total: dataArray.length }
                });

                dataArray.forEach((itemData, idx) => {
                    nextRows.push(this.spawn(itemData, idx, outputConfig, namespace, nextHistory, nextContent));
                });
            } else {
                // Standard: Update current row with the data
                const dataToApply = outputConfig.explode ? dataArray[0] : dataArray;

                // We can reuse 'spawn' to create the next state even for single items,
                // effectively treating it as a mutation of the flow
                nextRows.push(this.spawn(dataToApply, this.state.variationIndex, outputConfig, namespace, nextHistory, nextContent));
            }
        }

        return nextRows;
    }

    private spawn(
        data: any,
        variationIndex: number | undefined,
        outputConfig: OutputConfig,
        namespace: string,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        content: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): StepRow {
        // 1. Clone Data & Context
        const newData = JSON.parse(JSON.stringify(this.state.data));
        const newContext = { ...this.state.context };

        // 2. Apply New Data
        newContext[namespace] = data;

        if (outputConfig.mode === 'merge') {
            if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                Object.assign(newData, data);
                Object.assign(newContext, data);
            }
        } else if (outputConfig.mode === 'column' && outputConfig.column) {
            newData[outputConfig.column] = data;
            newContext[outputConfig.column] = data;
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
        const newRow = new StepRow(this.step, this.config, newState);
        newRow.lastResult = data;
        return newRow;
    }

    public async executeLlm(): Promise<PluginPacket[]> {
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
        return this.step.deps.llmFactory.create(targetConfig, targetConfig.messages);
    }

    /**
     * Helper to get a client bound to specific messages (used by CandidateStrategy/Judge)
     */
    async getBoundClient(config: ModelConfig): Promise<BoundLlmClient> {
        return this.createLlm(config);
    }
}
