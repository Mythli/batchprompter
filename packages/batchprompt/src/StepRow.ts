import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { Step } from './Step.js';
import { PipelineItem, OutputConfig } from './types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { ensureDir, aggressiveSanitize } from './utils/fileUtils.js';
import { renderSchemaObject } from './utils/schemaUtils.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { ResolvedModelConfig } from './config/schemas/model.js';
import { PluginPacket } from './plugins/types.js';

// Helper for async flatMap
async function flatMapAsync<T, U>(array: T[], callback: (item: T) => Promise<U[]>): Promise<U[]> {
    const results = await Promise.all(array.map(callback));
    return results.flat();
}

export class StepRow {
    // _persistentData: The actual data record that is being processed.
    // It is what gets passed to the next step and eventually saved.
    private _persistentData: Record<string, any>;

    // _templateContext: The "view" seen by Handlebars templates.
    // It is a superset of _persistentData + workspace + ephemeral plugin outputs.
    private _templateContext: Record<string, any>;

    private _content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    private _history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    public lastResult: any = null;

    // Hydrated Configuration State
    private _hydrated!: {
        outputDir: string;
        tempDir: string;
        outputBasename: string;
        outputExtension: string;
        schema?: any;
        model: ResolvedModelConfig;
    };
    private _isHydrated = false;

    constructor(
        public readonly step: Step,
        public readonly item: PipelineItem
    ) {
        // Initialize persistent data from the input row
        this._persistentData = { ...item.row };

        // Initialize template context with workspace and row data
        this._templateContext = { ...item.workspace, ...this._persistentData };

        this._history = [...item.history];
    }

    // --- Getters (Read-only for plugins) ---

    get context() { return this._templateContext; }
    get content() { return this._content; }
    get history() { return this._history; }

    getEvents() {
        return this.step.globalContext.events;
    }

    getPlugins() {
        return this.step.plugins;
    }

    getTempDir() {
        return this._hydrated?.tempDir || '/tmp';
    }

    get outputBasename() {
        return this._hydrated?.outputBasename;
    }

    get outputExtension() {
        return this._hydrated?.outputExtension;
    }

    get resolvedOutputDir() {
        return this._hydrated?.outputDir;
    }

    get resolvedSchema() {
        return this._hydrated?.schema;
    }

    get preparedMessages() {
        // Combine hydrated model messages with dynamic content and history
        const messages = [...this._history, ...this._hydrated.model.messages];
        if (this._content.length > 0) {
            messages.push({ role: 'user', content: this._content });
        }
        return messages;
    }

    // --- Core Logic ---

    async run(): Promise<PipelineItem[]> {
        // Initialize self
        await this.init();

        let currentRows: StepRow[] = [this];

        // --- Stage 1: Plugin Preparation ---
        for (const { instance, config } of this.step.plugins) {
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
        for (const { instance, config } of this.step.plugins) {
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
        for (const [key, val] of Object.entries(this._templateContext)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedContext[key] = aggressiveSanitize(stringVal);
        }

        let outputDir = '';
        let outputBasename = `output_${this.item.originalIndex}_${stepNum}`;
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
                    const renderedSchema = template(this._templateContext);
                    schema = JSON.parse(renderedSchema);
                } catch (e) {
                    console.warn(`[Row ${this.item.originalIndex}] Failed to parse schema template:`, e);
                }
            } else {
                try {
                    schema = renderSchemaObject(schema, this._templateContext);
                } catch (e: any) {
                    console.warn(`[Row ${this.item.originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }

        // 3. Resolve Model Messages
        const hydratedMessages = config.model.messages.map(msg => {
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
        });

        this._hydrated = {
            outputDir,
            tempDir,
            outputBasename,
            outputExtension,
            schema,
            model: {
                ...config.model,
                messages: hydratedMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
            }
        };

        this._isHydrated = true;
    }

    public toPipelineItem(): PipelineItem {
        return {
            ...this.item,
            row: this._persistentData, // Return the clean persistent data
            history: this._history,
            stepHistory: [...this.item.stepHistory, this.lastResult]
        };
    }

    /**
     * Applies a list of packets to the current row, potentially spawning new StepRow instances.
     */
    public applyPackets(packets: PluginPacket[], config: OutputConfig, namespace: string): StepRow[] {
        const nextRows: StepRow[] = [];

        for (const packet of packets) {
            // 1. Update History if provided (e.g. URL Expander)
            if (packet.history) {
                this._history = [...packet.history];
            }

            // 2. Append Content
            if (packet.contentParts && packet.contentParts.length > 0) {
                this._content.push(...packet.contentParts);
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
                    row: this.item.originalIndex,
                    step: this.step.stepIndex + 1,
                    type: 'explode',
                    message: `Exploding ${dataArray.length} items`,
                    data: { total: dataArray.length }
                });

                dataArray.forEach((itemData, idx) => {
                    nextRows.push(this.spawn(itemData, idx, config, namespace));
                });
            } else {
                // Standard: Update current row with the data (single item or array treated as single unit)
                // If explode is false, we treat the whole array as the result
                const dataToApply = config.explode ? dataArray[0] : dataArray;

                this.updateData(dataToApply, config, namespace);
                nextRows.push(this);
            }
        }

        return nextRows;
    }

    private spawn(data: any, variationIndex: number, config: OutputConfig, namespace: string): StepRow {
        const newItem = JSON.parse(JSON.stringify(this.item));
        newItem.variationIndex = variationIndex;

        const newRow = new StepRow(this.step, newItem);

        // Deep copy mutable state
        newRow._content = [...this._content];
        newRow._history = [...this._history];

        // Deep copy persistent data to ensure branch independence
        newRow._persistentData = JSON.parse(JSON.stringify(this._persistentData));

        // Shallow copy template context (it inherits parent's ephemeral state)
        newRow._templateContext = { ...this._templateContext };

        // Apply the new data specific to this branch
        newRow.updateData(data, config, namespace);

        // Note: newRow is NOT hydrated. It will hydrate itself when run() calls init().
        return newRow;
    }

    private updateData(data: any, config: OutputConfig, namespace: string) {
        this.lastResult = data;

        // 1. Always update template context with namespaced data (Ephemeral)
        this._templateContext[namespace] = data;

        // 2. Update persistent data based on strategy (Persistent)
        if (config.mode === 'merge') {
            if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                Object.assign(this._persistentData, data);
                // Sync to context so root-level variables are available immediately
                Object.assign(this._templateContext, data);
            }
        } else if (config.mode === 'column' && config.column) {
            this._persistentData[config.column] = data;
            // Sync to context
            this._templateContext[config.column] = data;
        }
    }

    private async executeLlm(): Promise<PluginPacket[]> {
        // Create LLM Client using hydrated model config
        const llm = this.createLlm(this._hydrated.model);
        
        // Execution Strategy
        let strategy: GenerationStrategy = new StandardStrategy(this);
        if (this.step.config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this);
        }

        return await strategy.execute();
    }

    /**
     * Creates a BoundLlmClient.
     * If config is provided, it uses that. Otherwise it uses the hydrated model config.
     */
    createLlm(config?: ResolvedModelConfig): BoundLlmClient {
        const targetConfig = config || this._hydrated.model;
        return this.step.globalContext.llmFactory.create(targetConfig, targetConfig.messages);
    }

    /**
     * Helper to get a client bound to specific messages (used by CandidateStrategy/Judge)
     */
    getBoundClient(config: ResolvedModelConfig): BoundLlmClient {
        return this.createLlm(config);
    }

    render(template: string, context: Record<string, any> = this._templateContext): string {
        if (!template) return '';
        const t = Handlebars.compile(template, { noEscape: true });
        return t(context);
    }
}
