import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { Step } from './Step.js';
import { PipelineItem, OutputConfig } from '../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { ensureDir, aggressiveSanitize } from '../utils/fileUtils.js';
import { renderSchemaObject } from '../utils/schemaUtils.js';
import { StandardStrategy } from '../strategies/StandardStrategy.js';
import { CandidateStrategy } from '../strategies/CandidateStrategy.js';
import { GenerationStrategy } from '../strategies/GenerationStrategy.js';
import { ResolvedModelConfig } from '../config/schemas/model.js';

export class StepRow {
    public readonly context: Record<string, any>;
    public readonly content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    public readonly history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    
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
        this.context = { ...item.row, ...item.workspace };
        this.history = [...item.history];
    }

    getEvents() {
        return this.step.globalContext.events;
    }

    getPlugins() {
        return this.step.plugins;
    }

    getTempDir() {
        return this.resolvedTempDir || '/tmp';
    }

    async run(): Promise<PipelineItem[]> {
        const stepNum = this.step.stepIndex + 1;

        // --- Stage 1: Path Resolution ---
        await this.resolvePaths();

        // --- Stage 2: Plugin Preparation ---
        for (const { instance, config } of this.step.plugins) {
            if (instance.prepare) {
                await instance.prepare(this, config);
            }
        }

        // --- Stage 3: Model Setup ---
        const modelConfig = this.step.config.model;
        
        // Check if we have messages or content to send
        const hasMessages = modelConfig.messages.length > 0 || this.content.length > 0;

        if (hasMessages) {
            // Resolve Schema (Dynamic)
            let schema = this.step.config.schema;
            if (schema) {
                if (typeof schema === 'string') {
                    // Template string -> Render -> Parse
                    try {
                        const template = Handlebars.compile(schema, { noEscape: true });
                        const renderedSchema = template(this.context);
                        schema = JSON.parse(renderedSchema);
                    } catch (e) {
                        console.warn(`[Row ${this.item.originalIndex}] Failed to parse schema template:`, e);
                    }
                } else {
                    // Render templates inside the schema object
                    try {
                        schema = renderSchemaObject(schema, this.context);
                    } catch (e: any) {
                        console.warn(`[Row ${this.item.originalIndex}] Failed to render schema templates:`, e);
                    }
                }
            }
            this.resolvedSchema = schema;

            // Create LLM Client & Hydrate Messages
            const llm = this.getBoundClient(modelConfig);
            
            // Get the hydrated messages from the client
            // The client now holds the rendered messages
            this.preparedMessages = llm.getMessages();

            // Append dynamic content from plugins (this.content)
            if (this.content.length > 0) {
                this.preparedMessages.push({ role: 'user', content: this.content });
            }

            // Prepend History
            this.preparedMessages = [...this.history, ...this.preparedMessages];

            // --- Stage 4: Execution Strategy ---
            
            let strategy: GenerationStrategy = new StandardStrategy(this);

            if (this.step.config.candidates > 1) {
                strategy = new CandidateStrategy(strategy as StandardStrategy, this);
            }

            const executionResult = await strategy.execute();

            let result = executionResult.raw !== undefined ? executionResult.raw : executionResult.columnValue;
            const historyMessage = executionResult.historyMessage;

            // --- Stage 5: Plugin Post-Processing ---
            for (const { instance, config } of this.step.plugins) {
                if (instance.postProcess) {
                    result = await instance.postProcess(this, config, result);
                }
            }
            
            // --- Stage 6: Output Handling (Explode/Merge) ---
            const outputConfig = this.step.config.output;
            const nextItems: PipelineItem[] = [];

            if (outputConfig.explode && Array.isArray(result)) {
                // Apply limit/offset
                let itemsToProcess = result;
                if (outputConfig.offset && outputConfig.offset > 0) {
                    itemsToProcess = itemsToProcess.slice(outputConfig.offset);
                }
                if (outputConfig.limit && outputConfig.limit > 0) {
                    itemsToProcess = itemsToProcess.slice(0, outputConfig.limit);
                }

                // Log explosion
                this.getEvents().emit('step:progress', {
                    row: this.item.originalIndex,
                    step: this.step.stepIndex + 1,
                    type: 'explode',
                    message: `Exploding ${result.length} items into ${itemsToProcess.length}`,
                    data: { total: result.length, count: itemsToProcess.length, limit: outputConfig.limit, offset: outputConfig.offset }
                });

                itemsToProcess.forEach((itemData, idx) => {
                    const newRow = { ...this.context };
                    this.applyOutput(newRow, itemData, outputConfig);

                    nextItems.push({
                        row: newRow,
                        workspace: this.item.workspace,
                        stepHistory: [...this.item.stepHistory, result],
                        history: [...this.history, historyMessage],
                        originalIndex: this.item.originalIndex,
                        variationIndex: idx
                    });
                });
            } else {
                const newRow = { ...this.context };
                this.applyOutput(newRow, result, outputConfig);

                nextItems.push({
                    row: newRow,
                    workspace: this.item.workspace,
                    stepHistory: [...this.item.stepHistory, result],
                    history: [...this.history, historyMessage],
                    originalIndex: this.item.originalIndex,
                    variationIndex: 0
                });
            }
            
            return nextItems;

        } else {
            // Pass-through
            return [{
                ...this.item,
                history: this.history
            }];
        }
    }

    private applyOutput(row: Record<string, any>, data: any, config: OutputConfig) {
        if (config.mode === 'merge') {
             if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                 Object.assign(row, data);
             }
        } else if (config.mode === 'column' && config.column) {
            row[config.column] = data;
        }
    }

    appendContent(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]) {
        this.content.push(...parts);
    }

    /**
     * Creates a BoundLlmClient by hydrating the messages in the config.
     */
    getBoundClient(config: ResolvedModelConfig): BoundLlmClient {
        // Hydrate messages
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

    // Alias for plugins that might still call createLlm
    createLlm(config: ResolvedModelConfig): BoundLlmClient {
        return this.getBoundClient(config);
    }

    render(template: string, context: Record<string, any> = this.context): string {
        if (!template) return '';
        // Handlebars throws on undefined helpers/properties sometimes, safe wrap?
        // Assuming standard usage.
        const t = Handlebars.compile(template, { noEscape: true });
        return t(context);
    }

    private async resolvePaths() {
        const { config, stepIndex } = this.step;
        const stepNum = stepIndex + 1;

        const sanitizedContext: Record<string, any> = {};
        for (const [key, val] of Object.entries(this.context)) {
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
