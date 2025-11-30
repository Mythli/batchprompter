import fsPromises from 'fs/promises';
import path from 'path';
import { getConfig } from "./getConfig.js";
import { LlmClient } from 'llm-fns';
import Handlebars from 'handlebars';
import Ajv from 'ajv';
import OpenAI from 'openai';
import { Parser } from 'json2csv';
import { ActionOptions, StepConfig } from './types.js';
import { resolvePromptInput, aggressiveSanitize } from './utils/fileUtils.js';
import { loadData } from './utils/dataLoader.js';
import { StepConfigurator } from './StepConfigurator.js';
import { StepExecutor } from './StepExecutor.js';

// Helper to render path templates
function renderPath(pathTemplate: string, context: any): string {
    const delegate = Handlebars.compile(pathTemplate, { noEscape: true });
    return delegate(context);
}

type RowHandler = (
    llm: LlmClient,
    renderedSystemPrompts: { global: string | null, steps: Record<number, string> },
    loadedJudgePrompts: { global: OpenAI.Chat.Completions.ChatCompletionContentPart[] | null, steps: Record<number, OpenAI.Chat.Completions.ChatCompletionContentPart[]> },
    loadedFeedbackPrompts: { global: string | null, steps: Record<number, string> },
    userPrompts: OpenAI.Chat.Completions.ChatCompletionContentPart[][],
    baseOutputPath: string,
    index: number,
    options: ActionOptions,
    validators: Record<string, any>,
    row: Record<string, any>
) => Promise<void>;

async function processBatch(
    dataFilePath: string,
    templateFilePaths: string[],
    outputTemplate: string | undefined,
    options: ActionOptions,
    handler: RowHandler
) {
    const concurrency = options.concurrency;

    // 1. Initialize Config with Concurrency
    console.log(`Initializing with concurrency: ${concurrency}`);
    const { llm } = await getConfig({ concurrency });

    // 2. Initialize Caches and Validators
    const fileCache = new Map<string, OpenAI.Chat.Completions.ChatCompletionContentPart[]>();
    const validatorCache = new Map<string, any>();
    // @ts-ignore
    const ajv = new Ajv({ strict: false });

    const getFileContent = async (input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> => {
        if (fileCache.has(input)) {
            return fileCache.get(input)!;
        }
        const content = await resolvePromptInput(input);
        fileCache.set(input, content);
        return content;
    };

    const getValidator = async (filePath: string): Promise<any> => {
        if (validatorCache.has(filePath)) {
            return validatorCache.get(filePath);
        }
        const parts = await getFileContent(filePath);
        // Extract text from parts for schema parsing
        const content = parts
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join('\n\n');

        const schemaObj = JSON.parse(content);
        const validator = ajv.compile(schemaObj);
        validatorCache.set(filePath, validator);
        return validator;
    };

    // Compile Output Template (Global)
    const outputDelegate = outputTemplate ? Handlebars.compile(outputTemplate, { noEscape: true }) : null;

    // 3. Read Data (CSV or JSON)
    const rows = await loadData(dataFilePath);

    console.log(`Found ${rows.length} rows to process.`);

    const tasks = rows.map(async (row, index) => {
        try {
            // --- Resolve Paths and Load Content per Row ---

            // 1. User Prompts
            let userPrompts: OpenAI.Chat.Completions.ChatCompletionContentPart[][] = [];
            if (templateFilePaths.length > 0) {
                for (const tPath of templateFilePaths) {
                    const resolvedPath = renderPath(tPath, row);
                    const parts = await getFileContent(resolvedPath);
                    
                    // Render Handlebars only for text parts
                    const renderedParts = parts.map(part => {
                        if (part.type === 'text') {
                            return { 
                                type: 'text' as const, 
                                text: Handlebars.compile(part.text, { noEscape: true })(row) 
                            };
                        }
                        return part;
                    });
                    userPrompts.push(renderedParts);
                }
            }

            // 2. Global System Prompt
            let globalSystemPrompt: string | null = null;
            if (options.system) {
                const resolvedPath = renderPath(options.system, row);
                const parts = await getFileContent(resolvedPath);
                const content = parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n');
                globalSystemPrompt = Handlebars.compile(content, { noEscape: true })(row);
            }

            // 3. Global Judge Prompt
            let globalJudgePrompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] | null = null;
            if (options.judgePrompt) {
                const resolvedPath = renderPath(options.judgePrompt, row);
                globalJudgePrompt = await getFileContent(resolvedPath);
            }

            // 4. Global Feedback Prompt
            let globalFeedbackPrompt: string | null = null;
            if (options.feedbackPrompt) {
                const resolvedPath = renderPath(options.feedbackPrompt, row);
                const parts = await getFileContent(resolvedPath);
                const content = parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n');
                globalFeedbackPrompt = Handlebars.compile(content, { noEscape: true })(row);
            }

            // 5. Prepare Row-Specific Options and Validators
            const rowValidators: Record<string, any> = {};
            const rowOptions: ActionOptions = { 
                ...options, 
                stepOverrides: {} 
            };

            // Global Schema
            if (options.schema) {
                const resolvedPath = renderPath(options.schema, row);
                const parts = await getFileContent(resolvedPath);
                const content = parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n');
                rowOptions.jsonSchema = JSON.parse(content);
                rowValidators['global'] = await getValidator(resolvedPath);
            }

            // Step Overrides
            const stepSystemPrompts: Record<number, string> = {};
            const stepJudgePrompts: Record<number, OpenAI.Chat.Completions.ChatCompletionContentPart[]> = {};
            const stepFeedbackPrompts: Record<number, string> = {};
            
            if (options.stepOverrides) {
                for (const [stepStr, config] of Object.entries(options.stepOverrides)) {
                    const step = parseInt(stepStr, 10);
                    const newConfig: StepConfig = { ...config };

                    // Step System Prompt
                    if (config.system) {
                        const resolvedPath = renderPath(config.system, row);
                        const parts = await getFileContent(resolvedPath);
                        const content = parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n');
                        stepSystemPrompts[step] = Handlebars.compile(content, { noEscape: true })(row);
                    }

                    // Step Judge Prompt
                    if (config.judgePrompt) {
                        const resolvedPath = renderPath(config.judgePrompt, row);
                        stepJudgePrompts[step] = await getFileContent(resolvedPath);
                    }

                    // Step Feedback Prompt
                    if (config.feedbackPrompt) {
                        const resolvedPath = renderPath(config.feedbackPrompt, row);
                        const parts = await getFileContent(resolvedPath);
                        const content = parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n');
                        stepFeedbackPrompts[step] = Handlebars.compile(content, { noEscape: true })(row);
                    }

                    // Step Schema
                    if (config.schema) {
                        const resolvedPath = renderPath(config.schema, row);
                        const parts = await getFileContent(resolvedPath);
                        const content = parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n');
                        newConfig.jsonSchema = JSON.parse(content);
                        rowValidators[stepStr] = await getValidator(resolvedPath);
                    }

                    if (rowOptions.stepOverrides) {
                        rowOptions.stepOverrides[step] = newConfig;
                    }
                }
            }

            const renderedSystemPrompts = {
                global: globalSystemPrompt,
                steps: stepSystemPrompts
            };

            const loadedJudgePrompts = {
                global: globalJudgePrompt,
                steps: stepJudgePrompts
            };

            const loadedFeedbackPrompts = {
                global: globalFeedbackPrompt,
                steps: stepFeedbackPrompts
            };

            // Fallback for User Prompts if none provided
            if (userPrompts.length === 0) {
                userPrompts = [[{ type: 'text', text: JSON.stringify(row, null, 2) }]];
            }

            // Interpolate Output Path (Sanitized)
            let baseOutputPath: string = '';
            if (outputDelegate) {
                const sanitizedRow: Record<string, string> = {};
                for (const [key, val] of Object.entries(row)) {
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = aggressiveSanitize(stringVal);
                    sanitizedRow[key] = sanitized;
                }
                baseOutputPath = outputDelegate(sanitizedRow);
            }

            console.log(`[Row ${index}] Processing...`);

            await handler(llm, renderedSystemPrompts, loadedJudgePrompts, loadedFeedbackPrompts, userPrompts, baseOutputPath, index, rowOptions, rowValidators, row);

        } catch (err) {
            console.error(`[Row ${index}] Error:`, err);
        }
    });

    await Promise.all(tasks);
    console.log("All tasks completed.");

    // Save updated data
    const ext = path.extname(dataFilePath);
    const isColumnMode = !!options.outputColumn || 
        (!!options.stepOverrides && Object.values(options.stepOverrides).some(s => !!s.outputColumn));

    let outputDataPath: string;
    if (options.dataOutput) {
        outputDataPath = options.dataOutput;
    } else if (isColumnMode) {
        outputDataPath = dataFilePath;
    } else {
        const basename = path.basename(dataFilePath, ext);
        outputDataPath = path.join(path.dirname(dataFilePath), `${basename}_processed${ext}`);
    }

    if (ext === '.json') {
        await fsPromises.writeFile(outputDataPath, JSON.stringify(rows, null, 2));
    } else {
        // Assume CSV
        try {
            const parser = new Parser();
            const csv = parser.parse(rows);
            await fsPromises.writeFile(outputDataPath, csv);
        } catch (e) {
            console.error("Failed to write CSV output. Ensure json2csv is installed.", e);
        }
    }
    console.log(`Updated data saved to ${outputDataPath}`);
}

const handleUnifiedGeneration: RowHandler = async (llm, renderedSystemPrompts, loadedJudgePrompts, loadedFeedbackPrompts, userPrompts, baseOutputPath, index, options, validators, row) => {
    // History of conversation (User + Assistant only)
    const persistentHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    const executor = new StepExecutor(llm, options.model);

    for (let i = 0; i < userPrompts.length; i++) {
        const stepIndex = i + 1;
        const promptParts = userPrompts[i];
        
        const config = StepConfigurator.resolve(
            row, 
            stepIndex, 
            userPrompts.length, 
            options, 
            baseOutputPath, 
            renderedSystemPrompts, 
            loadedJudgePrompts,
            loadedFeedbackPrompts,
            validators
        );

        try {
            const result = await executor.execute(
                row,
                index,
                stepIndex,
                config,
                promptParts,
                persistentHistory
            );

            persistentHistory.push({ role: 'user', content: promptParts });
            persistentHistory.push(result);

        } catch (error) {
            console.error(`[Row ${index}] Step ${stepIndex} Failed:`, error);
            throw error;
        }
    }
};

export async function runAction(
    dataFilePath: string,
    templateFilePaths: string[],
    outputTemplate: string | undefined,
    options: ActionOptions
) {
    try {
        await processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handleUnifiedGeneration);
    } catch (error) {
        console.error("Fatal Error:", error);
        throw error;
    }
}
