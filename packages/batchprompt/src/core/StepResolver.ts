import path from 'path';
import Handlebars from 'handlebars';
import { LlmClientFactory } from './LlmClientFactory.js';
import { GlobalContext, StepConfig, StepContext, PipelineItem } from '../types.js';
import { ResolvedModelConfig } from '../config/types.js';
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

        // 2. Resolve Configuration (Templates, Paths, Schemas)
        const resolvedStep: StepConfig = { ...stepConfig };

        // Output Paths
        if (stepConfig.outputTemplate) {
            const delegate = Handlebars.compile(stepConfig.outputTemplate, { noEscape: true });
            resolvedStep.outputPath = delegate(sanitizedRow);

            // Resolve to absolute path to ensure ArtifactHandler treats it as explicit output
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

        // If the global tmpDir looks like a file path (has extension), use its directory
        if (path.extname(resolvedGlobalTmpDir)) {
            resolvedGlobalTmpDir = path.dirname(resolvedGlobalTmpDir);
        }

        // Ensure absolute path to bypass FileSystemArtifactHandler's relative logic
        resolvedGlobalTmpDir = path.resolve(resolvedGlobalTmpDir);

        // Always use row_step structure for isolation to prevent collisions
        const rowStr = String(item.originalIndex).padStart(3, '0');
        const stepStr = String(stepNum).padStart(2, '0');
        resolvedStep.resolvedTempDir = path.join(resolvedGlobalTmpDir, `${rowStr}_${stepStr}`);

        await ensureDir(resolvedStep.resolvedTempDir);

        // Schema Resolution
        if (stepConfig.schemaPath) {
            try {
                // Resolve the path first (it might be dynamic)
                const pathTemplate = Handlebars.compile(stepConfig.schemaPath, { noEscape: true });
                const resolvedPath = pathTemplate(sanitizedRow);
                
                // Load the schema using the abstract loader (no direct fs usage)
                resolvedStep.jsonSchema = await this.schemaLoader.load(resolvedPath);
            } catch (e) {
                console.warn(`[Row ${item.originalIndex}] Failed to load/parse schema from '${stepConfig.schemaPath}':`, e);
            }
        }

        // Render Schema Templates (if any)
        if (resolvedStep.jsonSchema) {
            try {
                resolvedStep.jsonSchema = renderSchemaObject(resolvedStep.jsonSchema, sanitizedRow);
            } catch (e: any) {
                console.warn(`[Row ${item.originalIndex}] Failed to render schema templates:`, e);
            }
        }

        // 3. Create Step Context (LLM Clients)
        const mainLlm = this.llmFactory.create(resolvedStep.modelConfig);

        let judgeLlm: BoundLlmClient | undefined = undefined;
        if (resolvedStep.judge) {
            judgeLlm = this.llmFactory.create(resolvedStep.judge);
        }

        let feedbackLlm: BoundLlmClient | undefined = undefined;
        if (resolvedStep.feedback) {
            feedbackLlm = this.llmFactory.create(resolvedStep.feedback);
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

    createLlm(config: ResolvedModelConfig): BoundLlmClient {
        return this.llmFactory.create(config);
    }
}
