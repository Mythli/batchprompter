import path from 'path';
import Handlebars from 'handlebars';
import OpenAI from 'openai';
import { LlmClientFactory } from './LlmClientFactory.js';
import { GlobalContext, StepConfig, StepContext, PipelineItem } from '../types.js';
import { ResolvedModelConfig, ModelConfig } from '../config/types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';
import { SchemaLoader } from '../config/SchemaLoader.js';
import { renderSchemaObject } from '../utils/schemaUtils.js';

export interface ResolvedStepContext {
    resolvedStep: StepConfig;
    stepContext: StepContext;
    viewContext: Record<string, any>;
    sanitizedRow: Record<string, any>;
}

export class StepResolver {
    constructor(
        private llmFactory: LlmClientFactory,
        private globalContext: GlobalContext,
        private schemaLoader: SchemaLoader
    ) {}

    async resolve(
        item: PipelineItem,
        stepConfig: StepConfig,
        stepIndex: number,
        globalTmpDir: string
    ): Promise<ResolvedStepContext> {
        const stepNum = stepIndex + 1;

        // 1. Prepare View Context
        const viewContext = {
            ...item.row,
            ...item.workspace,
            steps: item.stepHistory,
            index: item.originalIndex
        };

        const sanitizedRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(viewContext)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedRow[key] = aggressiveSanitize(stringVal);
        }

        // 2. Resolve Configuration
        const resolvedStep: StepConfig = { ...stepConfig };

        // Output Paths
        if (stepConfig.outputPath) {
            const delegate = Handlebars.compile(stepConfig.outputPath, { noEscape: true });
            resolvedStep.outputPath = delegate(sanitizedRow);

            resolvedStep.resolvedOutputDir = path.resolve(path.dirname(resolvedStep.outputPath));
            await ensureDir(resolvedStep.resolvedOutputDir);

            const parsed = path.parse(resolvedStep.outputPath);
            resolvedStep.outputBasename = parsed.name;
            resolvedStep.outputExtension = parsed.ext;
        } else {
            resolvedStep.outputBasename = `output_${item.originalIndex}_${stepNum}`;
            resolvedStep.outputExtension = stepConfig.aspectRatio ? '.png' : '.txt';
        }

        // Temp Directory
        const tmpDirDelegate = Handlebars.compile(globalTmpDir, { noEscape: true });
        let resolvedGlobalTmpDir = tmpDirDelegate(sanitizedRow);
        if (path.extname(resolvedGlobalTmpDir)) {
            resolvedGlobalTmpDir = path.dirname(resolvedGlobalTmpDir);
        }
        resolvedGlobalTmpDir = path.resolve(resolvedGlobalTmpDir);
        const rowStr = String(item.originalIndex).padStart(3, '0');
        const stepStr = String(stepNum).padStart(2, '0');
        resolvedStep.resolvedTempDir = path.join(resolvedGlobalTmpDir, `${rowStr}_${stepStr}`);
        await ensureDir(resolvedStep.resolvedTempDir);

        // Schema Resolution
        if (stepConfig.schema) {
            if (typeof stepConfig.schema === 'string') {
                // Template string -> Render -> Load
                try {
                    const template = Handlebars.compile(stepConfig.schema, { noEscape: true });
                    const resolvedPath = template(sanitizedRow);
                    resolvedStep.schema = await this.schemaLoader.load(resolvedPath);
                } catch (e) {
                    console.warn(`[Row ${item.originalIndex}] Failed to load schema from template '${stepConfig.schema}':`, e);
                }
            } else {
                // Already an object (loaded by CLI)
                // Render templates inside the schema object
                try {
                    resolvedStep.schema = renderSchemaObject(stepConfig.schema, sanitizedRow);
                } catch (e: any) {
                    console.warn(`[Row ${item.originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }

        // 3. Create Step Context (LLM Clients)
        // Resolve Model Configs (Prompt Templates)
        const resolvedModel = await this.resolveModelConfig(resolvedStep.model, sanitizedRow);
        const mainLlm = this.llmFactory.create(resolvedModel);
        
        // Store resolved prompts back on step for Orchestrator
        resolvedStep.userPromptParts = resolvedModel.promptParts;

        let judgeLlm: BoundLlmClient | undefined = undefined;
        if (resolvedStep.judge) {
            const resolvedJudge = await this.resolveModelConfig(resolvedStep.judge, sanitizedRow);
            judgeLlm = this.llmFactory.create(resolvedJudge);
        }

        let feedbackLlm: BoundLlmClient | undefined = undefined;
        if (resolvedStep.feedback) {
            const resolvedFeedback = await this.resolveModelConfig(resolvedStep.feedback, sanitizedRow);
            feedbackLlm = this.llmFactory.create(resolvedFeedback);
        }

        const createLlm = (config: ResolvedModelConfig): BoundLlmClient => {
            return this.llmFactory.create(config);
        };

        const stepContext: StepContext = {
            global: this.globalContext,
            llm: mainLlm,
            judge: judgeLlm,
            feedback: feedbackLlm,
            createLlm
        };

        return {
            resolvedStep,
            stepContext,
            viewContext,
            sanitizedRow
        };
    }

    private async resolveModelConfig(config: ModelConfig, row: any): Promise<ResolvedModelConfig> {
        return {
            model: config.model,
            temperature: config.temperature,
            thinkingLevel: config.thinkingLevel,
            systemParts: await this.resolvePrompt(config.system, row),
            promptParts: await this.resolvePrompt(config.prompt, row)
        };
    }

    private async resolvePrompt(prompt: any, row: any): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (!prompt) return [];
        
        if (Array.isArray(prompt)) {
            // Already loaded content parts (from CLI hydration)
            // Just render templates inside parts
            return this.renderParts(prompt, row);
        }
        
        if (typeof prompt === 'string') {
            // It's a template string (CLI skipped it because of {{)
            const template = Handlebars.compile(prompt);
            const rendered = template(row);
            // Now resolve it (it might be a file path now, or raw text)
            return this.globalContext.contentResolver.resolve(rendered);
        }
        
        return [];
    }

    private renderParts(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        row: Record<string, any>
    ): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return parts.map(part => {
            if (part.type === 'text') {
                const delegate = Handlebars.compile(part.text, { noEscape: true });
                return { type: 'text' as const, text: delegate(row) };
            }
            return part;
        });
    }

    createLlm(config: ResolvedModelConfig): BoundLlmClient {
        return this.llmFactory.create(config);
    }
}
