import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { Step } from './Step.js';
import { PipelineItem } from '../types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { ensureDir } from '../utils/fileUtils.js';
import { StepExecutor } from '../StepExecutor.js';

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

    async run(): Promise<PipelineItem[]> {
        const events = this.step.globalContext.events;
        const stepNum = this.step.stepIndex + 1;

        // 1. Path Resolution
        await this.resolvePaths();

        // 2. Plugin Preparation
        for (const { instance, config } of this.step.plugins) {
            if (instance.prepare) {
                await instance.prepare(this, config);
            } else if (instance.prepareMessages) {
                // Legacy adapter: call prepareMessages and handle packets
                const context = {
                    row: { index: this.item.originalIndex, ...this.context },
                    stepIndex: this.step.stepIndex,
                    pluginIndex: 0, // Approximation
                    tempDirectory: this.resolvedTempDir || '/tmp',
                    emit: (event: any, ...args: any[]) => events.emit(event, ...args)
                };
                
                const result = await instance.prepareMessages(this.history, config, context as any);
                
                if (result) {
                    const packets = Array.isArray(result) ? result : [result];
                    for (const packet of packets) {
                        if (packet.contentParts) this.appendContent(packet.contentParts);
                        if (packet.data) {
                            // Simple merge for legacy support
                            Object.assign(this.context, packet.data);
                        }
                    }
                }
            }
        }

        // 3. Model Execution
        const modelConfig = this.step.config.model;
        const hasExplicitPrompt = 
            (modelConfig?.prompt && (Array.isArray(modelConfig.prompt) ? modelConfig.prompt.length > 0 : true)) ||
            (this.content.length > 0);

        if (hasExplicitPrompt) {
            // Hydrate main prompt
            const promptParts = await this.resolvePrompt(modelConfig.prompt);
            const systemParts = await this.resolvePrompt(modelConfig.system);

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

            // Execute using StepExecutor (reusing existing logic for retry/candidates/judge)
            const stepExecutor = new StepExecutor(events);
            
            const stepContext = {
                global: this.step.globalContext,
                llm: llm,
                judge: this.step.config.judge ? this.createLlm(this.step.config.judge) : undefined,
                feedback: this.step.config.feedback ? this.createLlm(this.step.config.feedback) : undefined,
                createLlm: (cfg: any) => this.createLlm(cfg)
            };

            // We need to pass plugin services for legacy support in StandardStrategy
            const pluginServices = {
                promptLoader: {} as any, // Not needed at runtime
                webSearch: this.step.globalContext.webSearch,
                imageSearch: this.step.globalContext.imageSearch,
                puppeteerHelper: this.step.globalContext.puppeteerHelper,
                createLlm: (cfg: any) => this.createLlm(cfg).getRawClient()
            };

            // We pass empty plugins array to StepExecutor because we already ran plugins.
            // However, StandardStrategy uses plugins for post-processing.
            // We should handle post-processing here in StepRow if possible, but StepExecutor is monolithic.
            // For now, let's pass the plugins to StepExecutor so it can run postProcessMessages (legacy).
            // New plugins using `postProcess` will be handled manually below.
            
            const legacyPlugins = this.step.plugins.map(p => ({
                instance: p.instance,
                config: p.config,
                def: { type: p.instance.type, id: 'legacy', output: { mode: 'ignore' as const, explode: false } }
            }));

            const executionResult = await stepExecutor.executeModel(
                stepContext,
                this.item.originalIndex,
                this.step.stepIndex,
                this.step.config,
                messages,
                this.item.variationIndex,
                legacyPlugins,
                pluginServices,
                this.resolvedTempDir || '/tmp',
                this.context
            );

            let result = executionResult.modelResult;
            const historyMessage = executionResult.historyMessage;

            // 4. Post Processing (New API)
            for (const { instance, config } of this.step.plugins) {
                if (instance.postProcess) {
                    result = await instance.postProcess(this, config, result);
                }
            }
            
            // 5. Result Processing
            // Handle output mode (merge/column)
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
            // Pass-through
            return [{
                ...this.item,
                history: this.history
            }];
        }
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

    render(template: string): string {
        if (!template) return '';
        const t = Handlebars.compile(template, { noEscape: true });
        return t(this.context);
    }

    private async resolvePaths() {
        const { config, stepIndex } = this.step;
        const stepNum = stepIndex + 1;

        if (config.outputPath) {
            const rendered = this.render(config.outputPath);
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
            const rendered = this.render(config.tmpDir);
            this.resolvedTempDir = path.resolve(rendered);
            await ensureDir(this.resolvedTempDir);
        }
    }
}
