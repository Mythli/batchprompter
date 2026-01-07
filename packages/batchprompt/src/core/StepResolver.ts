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

        // 1. Prepare View Context (Raw Data)
        const viewContext = {
            ...item.row,
            ...item.workspace,
            steps: item.stepHistory,
            index: item.originalIndex
        };

        // 2. Prepare Sanitized Context (For File Paths Only)
        const sanitizedRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(viewContext)) {
             const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
             sanitizedRow[key] = aggressiveSanitize(stringVal);
        }

        // 3. Resolve Configuration
        const resolvedStep: StepConfig = { ...stepConfig };

        // Output Paths (Use Sanitized Context)
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

        // Temp Directory (Use Sanitized Context)
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

        // Schema Resolution (Use Raw View Context)
        if (stepConfig.schema) {
            if (typeof stepConfig.schema === 'string') {
                // Template string -> Render -> Load
                try {
                    const template = Handlebars.compile(stepConfig.schema, { noEscape: true });
                    const resolvedPath = template(viewContext); // Use raw context for path resolution? Usually paths need sanitization, but schema paths might be static or controlled. Let's use viewContext to allow spaces in paths if needed, or sanitized if it's user input. 
                    // Actually, for file paths, sanitized is safer, but for logic, raw is better. 
                    // Let's stick to viewContext for flexibility, assuming the user handles path safety in the template if needed.
                    resolvedStep.schema = await this.schemaLoader.load(resolvedPath);
                } catch (e) {
                    console.warn(`[Row ${item.originalIndex}] Failed to load schema from template '${stepConfig.schema}':`, e);
                }
            } else {
                // Already an object (loaded by CLI)
                // Render templates inside the schema object using RAW context
                try {
                    resolvedStep.schema = renderSchemaObject(stepConfig.schema, viewContext);
                } catch (e: any) {
                    console.warn(`[Row ${item.originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }

        // 4. Create Step Context (LLM Clients)
        // Resolve Model Configs (Prompt Templates) using RAW View Context
        const resolvedModel = await this.resolveModelConfig(resolvedStep.model, viewContext);
        const mainLlm = this.llmFactory.create(resolvedModel);
        
        // Store resolved prompts back on step for Orchestrator
        resolvedStep.userPromptParts = resolvedModel.promptParts;

        let judgeLlm: BoundLlmClient | undefined = undefined;
        if (resolvedStep.judge) {
            const resolvedJudge = await this.resolveModelConfig(resolvedStep.judge, viewContext);
            judgeLlm = this.llmFactory.create(resolvedJudge);
        }

        let feedbackLlm: BoundLlmClient | undefined = undefined;
        if (resolvedStep.feedback) {
            const resolvedFeedback = await this.resolveModelConfig(resolvedStep.feedback, viewContext);
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
