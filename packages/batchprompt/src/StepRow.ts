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

export class StepRow {
    private _context: Record<string, any>;
    private _content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    private _history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    
    public lastResult: any = null;

    // Resolved paths
    public resolvedOutputDir?: string;
    public resolvedTempDir?: string;
    public outputBasename?: string;
    public outputExtension?: string;

    // Prepared state for strategies
    public preparedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    public resolvedSchema: any;

    constructor(
        public readonly step: Step,
        public readonly item: PipelineItem
    ) {
        this._context = { ...item.row, ...item.workspace };
        this._history = [...item.history];
    }

    // --- Getters (Read-only for plugins) ---

    get context() { return this._context; }
    get content() { return this._content; }
    get history() { return this._history; }

    getEvents() {
        return this.step.globalContext.events;
    }

    getPlugins() {
        return this.step.plugins;
    }

    getTempDir() {
        return this.resolvedTempDir || '/tmp';
    }

    // --- Core Logic ---

    async run(): Promise<PipelineItem[]> {
        await this.resolvePaths();

        let currentRows: StepRow[] = [this];

        // --- Stage 1: Plugin Preparation ---
        for (const { instance, config } of this.step.plugins) {
            if (instance.prepare) {
                const nextRows: StepRow[] = [];
                for (const row of currentRows) {
                    const packet = await instance.prepare(row, config);
                    if (packet) {
                        nextRows.push(...row.applyPacket(packet, config.output, instance.type));
                    } else {
                        nextRows.push(row);
                    }
                }
                currentRows = nextRows;
            }
        }

        // --- Stage 2: Model Execution ---
        const modelConfig = this.step.config.model;
        const hasMessages = modelConfig.messages.length > 0;

        if (hasMessages) {
            const nextRows: StepRow[] = [];
            for (const row of currentRows) {
                const packet = await row.executeLlm();
                nextRows.push(...row.applyPacket(packet, this.step.config.output, 'modelOutput'));
            }
            currentRows = nextRows;
        }

        // --- Stage 3: Plugin Post-Processing ---
        for (const { instance, config } of this.step.plugins) {
            if (instance.postProcess) {
                const nextRows: StepRow[] = [];
                for (const row of currentRows) {
                    const packet = await instance.postProcess(row, config, row.lastResult);
                    if (packet) {
                        nextRows.push(...row.applyPacket(packet, config.output, instance.type));
                    } else {
                        nextRows.push(row);
                    }
                }
                currentRows = nextRows;
            }
        }

        // Convert StepRows back to PipelineItems
        return currentRows.map(row => ({
            ...row.item,
            row: row.context, // The context contains the updated row data
            history: row.history,
            stepHistory: [...row.item.stepHistory, row.lastResult]
        }));
    }

    /**
     * Applies a packet to the current row, potentially spawning new StepRow instances if exploding.
     */
    public applyPacket(packet: PluginPacket, config: OutputConfig, namespace: string): StepRow[] {
        if (packet.filter) {
            return [];
        }

        const results: StepRow[] = [];
        const data = packet.data;

        if (config.explode && Array.isArray(data)) {
            // Log explosion
            this.getEvents().emit('step:progress', {
                row: this.item.originalIndex,
                step: this.step.stepIndex + 1,
                type: 'explode',
                message: `Exploding ${data.length} items`,
                data: { total: data.length }
            });

            data.forEach((itemData, idx) => {
                const newRow = this.clone();
                newRow.item.variationIndex = idx;
                newRow.updateData(itemData, config, namespace);
                newRow.appendContent(packet.contentParts);
                results.push(newRow);
            });
        } else {
            this.updateData(data, config, namespace);
            this.appendContent(packet.contentParts);
            results.push(this);
        }

        return results;
    }

    private updateData(data: any, config: OutputConfig, namespace: string) {
        this.lastResult = data;
        
        // Always update context for templates
        this._context[namespace] = data;

        // Update row based on strategy
        if (config.mode === 'merge') {
            if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                Object.assign(this._context, data);
            } else {
                this._context[namespace] = data;
            }
        } else if (config.mode === 'column' && config.column) {
            this._context[config.column] = data;
        }
    }

    private appendContent(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]) {
        if (parts && parts.length > 0) {
            this._content.push(...parts);
        }
    }

    private async executeLlm(): Promise<PluginPacket> {
        const modelConfig = this.step.config.model;

        // Resolve Schema (Dynamic)
        let schema = this.step.config.schema;
        if (schema) {
            if (typeof schema === 'string') {
                try {
                    const template = Handlebars.compile(schema, { noEscape: true });
                    const renderedSchema = template(this._context);
                    schema = JSON.parse(renderedSchema);
                } catch (e) {
                    console.warn(`[Row ${this.item.originalIndex}] Failed to parse schema template:`, e);
                }
            } else {
                try {
                    schema = renderSchemaObject(schema, this._context);
                } catch (e: any) {
                    console.warn(`[Row ${this.item.originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }
        this.resolvedSchema = schema;

        // Create LLM Client & Hydrate Messages
        const llm = this.getBoundClient(modelConfig);
        this.preparedMessages = llm.getMessages();

        // Append dynamic content from plugins
        if (this._content.length > 0) {
            this.preparedMessages.push({ role: 'user', content: this._content });
        }

        // Prepend History
        this.preparedMessages = [...this._history, ...this.preparedMessages];

        // Execution Strategy
        let strategy: GenerationStrategy = new StandardStrategy(this);
        if (this.step.config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this);
        }

        return await strategy.execute();
    }

    private clone(): StepRow {
        const newItem = JSON.parse(JSON.stringify(this.item));
        const newRow = new StepRow(this.step, newItem);
        newRow._content = [...this._content];
        newRow._history = [...this._history];
        newRow.resolvedOutputDir = this.resolvedOutputDir;
        newRow.resolvedTempDir = this.resolvedTempDir;
        newRow.outputBasename = this.outputBasename;
        newRow.outputExtension = this.outputExtension;
        return newRow;
    }

    /**
     * Creates a BoundLlmClient by hydrating the messages in the config.
     */
    getBoundClient(config: ResolvedModelConfig): BoundLlmClient {
        const hydratedMessages = config.messages.map(msg => {
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

        return this.step.globalContext.llmFactory.create(config, hydratedMessages as OpenAI.Chat.Completions.ChatCompletionMessageParam[]);
    }

    createLlm(config: ResolvedModelConfig): BoundLlmClient {
        return this.getBoundClient(config);
    }

    render(template: string, context: Record<string, any> = this._context): string {
        if (!template) return '';
        const t = Handlebars.compile(template, { noEscape: true });
        return t(context);
    }

    private async resolvePaths() {
        const { config, stepIndex } = this.step;
        const stepNum = stepIndex + 1;

        const sanitizedContext: Record<string, any> = {};
        for (const [key, val] of Object.entries(this._context)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedContext[key] = aggressiveSanitize(stringVal);
        }

        if (config.outputPath) {
            const rendered = this.render(config.outputPath, sanitizedContext);
            this.resolvedOutputDir = path.resolve(path.dirname(rendered));
            await ensureDir(this.resolvedOutputDir);

            const parsed = path.parse(rendered);
            this.outputBasename = parsed.name;
            this.outputExtension = parsed.ext;
        } else {
            this.outputBasename = `output_${this.item.originalIndex}_${stepNum}`;
            this.outputExtension = config.aspectRatio ? '.png' : '.txt';
        }

        if (config.tmpDir) {
            const rendered = this.render(config.tmpDir, sanitizedContext);
            this.resolvedTempDir = path.resolve(rendered);
            await ensureDir(this.resolvedTempDir);
        }
    }
}
