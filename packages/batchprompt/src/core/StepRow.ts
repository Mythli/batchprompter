import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { Step } from './Step.js';
import { PipelineItem, StepContext } from '../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { ensureDir, aggressiveSanitize } from '../utils/fileUtils.js';
import { renderSchemaObject } from '../utils/schemaUtils.js';
import { StandardStrategy } from '../strategies/StandardStrategy.js';
import { CandidateStrategy } from '../strategies/CandidateStrategy.js';
import { GenerationStrategy } from '../strategies/GenerationStrategy.js';

export class StepRow {
    public readonly context: Record<string, any>;
    public readonly content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    public readonly history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    
    // Resolved paths
    public resolvedOutputDir?: string;
    public resolvedTempDir?: string;
    public outputBasename?: string;
    public outputExtension?: string;

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
        const hasExplicitPrompt = 
            (modelConfig?.prompt && (Array.isArray(modelConfig.prompt) ? modelConfig.prompt.length > 0 : true)) ||
            (this.content.length > 0);

        if (hasExplicitPrompt) {
            // Hydrate main prompt
            const promptParts = await this.resolvePrompt(modelConfig.prompt);
            const systemParts = await this.resolvePrompt(modelConfig.system);

            // Resolve Schema (Dynamic)
            let schema = this.step.config.schema;
            if (schema) {
                if (typeof schema === 'string') {
                    // Template string -> Render -> Load
                    try {
                        const template = Handlebars.compile(schema, { noEscape: true });
                        const resolvedPath = template(this.context);
                        const content = await this.step.globalContext.contentResolver.readText(resolvedPath);
                        schema = JSON.parse(content);
                    } catch (e) {
                        console.warn(`[Row ${this.item.originalIndex}] Failed to load schema from template '${schema}':`, e);
                    }
                } else {
                    // Render templates inside the schema object using RAW context
                    try {
                        schema = renderSchemaObject(schema, this.context);
                    } catch (e: any) {
                        console.warn(`[Row ${this.item.originalIndex}] Failed to render schema templates:`, e);
                    }
                }
            }

            // Create LLM Client
            const llm = this.createLlm({
                ...modelConfig,
                promptParts: [], // We handle prompt parts manually via content stream
                systemParts
            });

            // Build Messages
            const userContent = [...promptParts, ...this.content];
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...this.history];
            
            if (systemParts.length > 0) {
                const systemText = systemParts.map(p => p.type === 'text' ? p.text : '').join('\n');
                messages.push({ role: 'system', content: systemText });
            }
            
            if (userContent.length > 0) {
                messages.push({ role: 'user', content: userContent });
            }

            // --- Stage 4: Execution Strategy ---
            
            // Build StepContext for strategies
            const stepContext: StepContext = {
                global: this.step.globalContext,
                llm: llm,
                judge: this.step.config.judge ? this.createLlm(this.step.config.judge) : undefined,
                feedback: this.step.config.feedback ? this.createLlm(this.step.config.feedback) : undefined,
                createLlm: (cfg: any) => this.createLlm(cfg)
            };

            // Inject resolved schema into config for Strategy
            const configForStrategy = { ...this.step.config, schema };

            // Select Strategy
            let strategy: GenerationStrategy = new StandardStrategy(this);

            if (configForStrategy.candidates > 1) {
                strategy = new CandidateStrategy(strategy as StandardStrategy, stepContext, this.step.globalContext.events);
            }

            // Execute Strategy
            const executionResult = await strategy.execute(
                this.context,
                this.item.originalIndex,
                this.step.stepIndex,
                configForStrategy,
                messages,
                undefined, // cacheSalt
                undefined, // outputPathOverride
                false, // skipCommands
                this.item.variationIndex
            );

            let result = executionResult.raw !== undefined ? executionResult.raw : executionResult.columnValue;
            const historyMessage = executionResult.historyMessage;

            // --- Stage 5: Plugin Post-Processing ---
            for (const { instance, config } of this.step.plugins) {
                if (instance.postProcess) {
                    result = await instance.postProcess(this, config, result);
                }
            }
            
            // --- Stage 6: Output Handling ---
            const outputConfig = this.step.config.output;
            const newRow = { ...this.context };
            
            if (outputConfig.mode === 'merge') {
                if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
                    Object.assign(newRow, result);
                }
            } else if (outputConfig.mode === 'column' && outputConfig.column) {
                newRow[outputConfig.column] = result;
            }

            const newItem: PipelineItem = {
                row: newRow,
                workspace: this.item.workspace,
                stepHistory: [...this.item.stepHistory, result],
                history: [...this.history, historyMessage],
                originalIndex: this.item.originalIndex,
                variationIndex: this.item.variationIndex
            };
            
            return [newItem];

        } else {
            // Pass-through (no model execution)
            return [{
                ...this.item,
                history: this.history
            }];
        }
    }

    appendContent(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]) {
        this.content.push(...parts);
    }

    createLlm(config: any): BoundLlmClient {
        const systemParts = this.renderParts(config.systemParts || []);
        const promptParts = this.renderParts(config.promptParts || []);
        
        return this.step.globalContext.llmFactory.create({
            ...config,
            systemParts,
            promptParts
        });
    }

    async resolvePrompt(prompt: any): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (Array.isArray(prompt)) {
            return this.renderParts(prompt);
        }
        return [];
    }

    renderParts(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return parts.map(part => {
            if (part.type === 'text') {
                return { type: 'text', text: this.render(part.text) };
            }
            return part;
        });
    }

    render(template: string, context: Record<string, any> = this.context): string {
        if (!template) return '';
        const t = Handlebars.compile(template, { noEscape: true });
        return t(context);
    }

    private async resolvePaths() {
        const { config, stepIndex } = this.step;
        const stepNum = stepIndex + 1;

        // Create sanitized context for file paths
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
