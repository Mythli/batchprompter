import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { Step } from './Step.js';
import { PipelineItem, OutputConfig, StepConfig, ResolvedModelConfig } from './types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { ensureDir, aggressiveSanitize } from './utils/fileUtils.js';
import { renderSchemaObject } from './utils/schemaUtils.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { PluginPacket } from './plugins/types.js';

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

    // Hydrated Configuration State
    public hydratedConfig!: StepConfig;
    private _isHydrated = false;

    constructor(
        public readonly step: Step,
        private readonly state: StepRowState
    ) {}

    // --- Getters (Read-only for plugins) ---

    get context() { return this.state.context; }
    get content() { return this.state.content; }
    get history() { return this.state.history; }

    getEvents() {
        return this.step.globalContext.events;
    }

    getPlugins() {
        return this.hydratedConfig?.plugins || [];
    }

    getTempDir() {
        return this.hydratedConfig?.resolvedTempDir || '/tmp';
    }

    get outputBasename() {
        return this.hydratedConfig?.outputBasename;
    }

    get outputExtension() {
        return this.hydratedConfig?.outputExtension;
    }

    get resolvedOutputDir() {
        return this.hydratedConfig?.resolvedOutputDir;
    }

    get resolvedSchema() {
        return this.hydratedConfig?.schema;
    }

    get preparedMessages() {
        // Combine hydrated model messages with dynamic content and history
        const messages = [...this.state.history, ...this.hydratedConfig.model.messages];
        if (this.state.content.length > 0) {
            messages.push({ role: 'user', content: this.state.content });
        }
        return messages;
    }

    // --- Core Logic ---

    async run(): Promise<PipelineItem[]> {
        // Initialize self (Hydration)
        await this.init();

        let currentRows: StepRow[] = [this];

        // --- Stage 1: Plugin Preparation ---
        for (const { instance, config } of this.hydratedConfig.plugins) {
            if (instance.prepare) {
                currentRows = await flatMapAsync(currentRows, async (row) => {
                    // Ensure row is initialized (idempotent)
                    await row.init();
                    const packets = await instance.prepare!(row, config);
                    return row.applyPackets(packets, config.output, instance.type);
                });
            }
        }

        // --- Stage 2: Model Execution ---
        const modelConfig = this.step.config.model;
        const hasMessages = modelConfig.messages.length > 0;

        if (hasMessages) {
            currentRows = await flatMapAsync(currentRows, async (row) => {
                // Ensure row is initialized (idempotent)
                await row.init();
                const packets = await row.executeLlm();
                return row.applyPackets(packets, this.step.config.output, 'modelOutput');
            });
        }

        // --- Stage 3: Plugin Post-Processing ---
        for (const { instance, config } of this.hydratedConfig.plugins) {
            if (instance.postProcess) {
                currentRows = await flatMapAsync(currentRows, async (row) => {
                    // Ensure row is initialized (idempotent)
                    await row.init();
                    const packets = await instance.postProcess!(row, config, row.lastResult);
                    return row.applyPackets(packets, config.output, instance.type);
                });
            }
        }

        // Convert StepRows back to PipelineItems
        return currentRows.map(row => row.toPipelineItem());
    }

    public async init(): Promise<void> {
        if (this._isHydrated) return;

        const { config, stepIndex } = this.step;
        const stepNum = stepIndex + 1;

        // 1. Resolve Paths
        const sanitizedContext: Record<string, any> = {};
        for (const [key, val] of Object.entries(this.state.context)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedContext[key] = aggressiveSanitize(stringVal);
        }

        let outputDir = '';
        let outputBasename = `output_${this.state.originalIndex}_${stepNum}`;
        let outputExtension = config.aspectRatio ? '.png' : '.txt';
        let tempDir = '/tmp';

        if (config.outputPath) {
            const rendered = this.render(config.outputPath, sanitizedContext);
            outputDir = path.resolve(path.dirname(rendered));
            await ensureDir(outputDir);

            const parsed = path.parse(rendered);
            outputBasename = parsed.name;
            outputExtension = parsed.ext;
        }

        if (config.tmpDir) {
            const rendered = this.render(config.tmpDir, sanitizedContext);
            tempDir = path.resolve(rendered);
            await ensureDir(tempDir);
        }

        // 2. Resolve Schema
        let schema = config.schema;
        if (schema) {
            if (typeof schema === 'string') {
                try {
                    const template = Handlebars.compile(schema, { noEscape: true });
                    const renderedSchema = template(this.state.context);
                    schema = JSON.parse(renderedSchema);
                } catch (e) {
                    console.warn(`[Row ${this.state.originalIndex}] Failed to parse schema template:`, e);
                }
            } else {
                try {
                    schema = renderSchemaObject(schema, this.state.context);
                } catch (e: any) {
                    console.warn(`[Row ${this.state.originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }

        // 3. Resolve Model Messages
        const hydrateModel = (m?: ResolvedModelConfig): ResolvedModelConfig | undefined => {
            if (!m) return undefined;
            return {
                ...m,
                messages: m.messages.map(msg => {
                    if (typeof msg.content === 'string') {
                        return { ...msg, content: this.render(msg.content) };
                    } else if (Array.isArray(msg.content)) {
                        const hydratedContent = msg.content.map(part => {
                            if (part.type === 'text') {
                                return { ...part, text: this.render(part.text) };
                            }
                            return part;
                        });
                        return { ...msg, content: hydratedContent };
                    }
                    return msg;
                }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
            };
        };

        // 4. Hydrate Plugins
        const hydratedPlugins = await Promise.all(config.plugins.map(async (p) => {
            const hydratedConfig = await p.instance.hydrate(p.config, this.state.context);
            return {
                ...p,
                config: hydratedConfig
            };
        }));

        this.hydratedConfig = {
            ...config,
            resolvedOutputDir: outputDir,
            resolvedTempDir: tempDir,
            outputBasename,
            outputExtension,
            schema,
            model: hydrateModel(config.model)!,
            judge: hydrateModel(config.judge),
            feedback: config.feedback ? { ...hydrateModel(config.feedback)!, loops: config.feedback.loops } : undefined,
            plugins: hydratedPlugins
        };

        this._isHydrated = true;
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
    public applyPackets(packets: PluginPacket[], config: OutputConfig, namespace: string): StepRow[] {
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

            if (config.explode && dataArray.length > 1) {
                // Explode: Spawn new rows for each item
                this.getEvents().emit('step:progress', {
                    row: this.state.originalIndex,
                    step: this.step.stepIndex + 1,
                    type: 'explode',
                    message: `Exploding ${dataArray.length} items`,
                    data: { total: dataArray.length }
                });

                dataArray.forEach((itemData, idx) => {
                    nextRows.push(this.spawn(itemData, idx, config, namespace, nextHistory, nextContent));
                });
            } else {
                // Standard: Update current row with the data
                const dataToApply = config.explode ? dataArray[0] : dataArray;
                
                // We can reuse 'spawn' to create the next state even for single items, 
                // effectively treating it as a mutation of the flow
                nextRows.push(this.spawn(dataToApply, this.state.variationIndex, config, namespace, nextHistory, nextContent));
            }
        }

        return nextRows;
    }

    private spawn(
        data: any, 
        variationIndex: number | undefined, 
        config: OutputConfig, 
        namespace: string,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        content: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): StepRow {
        // 1. Clone Data & Context
        const newData = JSON.parse(JSON.stringify(this.state.data));
        const newContext = { ...this.state.context };

        // 2. Apply New Data
        newContext[namespace] = data;

        if (config.mode === 'merge') {
            if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                Object.assign(newData, data);
                Object.assign(newContext, data);
            }
        } else if (config.mode === 'column' && config.column) {
            newData[config.column] = data;
            newContext[config.column] = data;
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
        const newRow = new StepRow(this.step, newState);
        newRow.lastResult = data;
        return newRow;
    }

    private async executeLlm(): Promise<PluginPacket[]> {
        // Create LLM Client using hydrated model config
        const llm = this.createLlm(this.hydratedConfig.model);
        
        // Execution Strategy
        let strategy: GenerationStrategy = new StandardStrategy(this);
        if (this.hydratedConfig.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this);
        }

        return await strategy.execute();
    }

    /**
     * Creates a BoundLlmClient.
     * If config is provided, it uses that. Otherwise it uses the hydrated model config.
     */
    createLlm(config?: ResolvedModelConfig): BoundLlmClient {
        const targetConfig = config || this.hydratedConfig.model;
        return this.step.globalContext.llmFactory.create(targetConfig, targetConfig.messages);
    }

    /**
     * Helper to get a client bound to specific messages (used by CandidateStrategy/Judge)
     */
    getBoundClient(config: ResolvedModelConfig): BoundLlmClient {
        return this.createLlm(config);
    }

    render(template: string, context: Record<string, any> = this.state.context): string {
        if (!template) return '';
        const t = Handlebars.compile(template, { noEscape: true });
        return t(context);
    }
}
