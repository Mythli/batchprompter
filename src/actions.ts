import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import csv from 'csv-parser';
import sanitize from 'sanitize-filename';
import { getConfig } from "./getConfig.js";
import { z } from 'zod';
import { AskGptFunction } from './createCachedGptAsk.js';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { LlmReQuerier, LlmQuerierError } from './llmReQuerier.js';
import Ajv from 'ajv';
import OpenAI from 'openai';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Helper to ensure directory exists
async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
}

function getPartType(filePath: string): 'text' | 'image' | 'audio' {
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
    if (['.mp3', '.wav'].includes(ext)) return 'audio';
    return 'text';
}

// Helper to read prompt input (file or directory) and return Content Parts
async function readPromptInput(inputPath: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
    const stats = await fsPromises.stat(inputPath);
    let filePaths: string[] = [];

    if (stats.isDirectory()) {
        const files = await fsPromises.readdir(inputPath);
        files.sort();
        filePaths = files
            .filter(f => !f.startsWith('.'))
            .map(f => path.join(inputPath, f));
    } else {
        filePaths = [inputPath];
    }

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    let currentTextBuffer: string[] = [];

    const flushText = () => {
        if (currentTextBuffer.length > 0) {
            parts.push({ type: 'text', text: currentTextBuffer.join('\n\n') });
            currentTextBuffer = [];
        }
    };

    for (const filePath of filePaths) {
        // If we are processing a directory, we need to stat each file.
        // If inputPath was a file, we already stat-ed it, but doing it again is cheap and safe.
        const fileStats = await fsPromises.stat(filePath);
        if (!fileStats.isFile()) continue;

        const type = getPartType(filePath);
        
        if (type === 'text') {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            if (content.trim().length > 0) {
                currentTextBuffer.push(content);
            }
        } else {
            flushText(); // Push any accumulated text before this binary part
            
            const buffer = await fsPromises.readFile(filePath);
            const base64 = buffer.toString('base64');
            const ext = path.extname(filePath).toLowerCase();

            if (type === 'image') {
                let mime = 'image/jpeg';
                if (ext === '.png') mime = 'image/png';
                if (ext === '.gif') mime = 'image/gif';
                if (ext === '.webp') mime = 'image/webp';
                
                parts.push({
                    type: 'image_url',
                    image_url: { url: `data:${mime};base64,${base64}` }
                });
            } else if (type === 'audio') {
                const format = ext === '.mp3' ? 'mp3' : 'wav';
                parts.push({
                    type: 'input_audio',
                    input_audio: { data: base64, format }
                });
            }
        }
    }
    flushText();

    // If empty, return empty text part
    if (parts.length === 0) {
        return [{ type: 'text', text: '' }];
    }

    return parts;
}

// Response schema to extract image URL
const responseSchema = z.object({
    choices: z.array(z.object({
        message: z.object({
            content: z.string().nullable(),
            images: z.array(z.object({
                image_url: z.object({
                    url: z.string()
                })
            })).optional()
        })
    })).min(1)
});

interface StepConfig {
    system?: string;
    schema?: string;
    jsonSchema?: any;
    verifyCommand?: string;
}

interface ActionOptions {
    concurrency: number;
    aspectRatio?: string;
    model?: string;
    system?: string;
    schema?: string;
    jsonSchema?: any;
    verifyCommand?: string;
    stepOverrides?: Record<number, StepConfig>;
}

type RowHandler = (
    ask: AskGptFunction,
    renderedSystemPrompts: { global: string | null, steps: Record<number, string> },
    userPrompts: OpenAI.Chat.Completions.ChatCompletionContentPart[][],
    baseOutputPath: string,
    index: number,
    options: ActionOptions,
    validators: Record<string, any>
) => Promise<void>;

function getIndexedPath(basePath: string, stepIndex: number, totalSteps: number): string {
    if (totalSteps <= 1) return basePath;
    const ext = path.extname(basePath);
    const name = path.basename(basePath, ext);
    const dir = path.dirname(basePath);
    return path.join(dir, `${name}_${stepIndex}${ext}`);
}

async function loadData(filePath: string): Promise<Record<string, any>[]> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
            throw new Error('JSON file must contain an array of objects.');
        }
        return data;
    } else {
        const rows: Record<string, string>[] = [];
        await new Promise<void>((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => rows.push(data))
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
        return rows;
    }
}

function renderPath(pathTemplate: string, context: any): string {
    const delegate = Handlebars.compile(pathTemplate, { noEscape: true });
    return delegate(context);
}

async function processBatch(
    dataFilePath: string,
    templateFilePaths: string[],
    outputTemplate: string,
    options: ActionOptions,
    handler: RowHandler
) {
    const concurrency = options.concurrency;

    // 1. Initialize Config with Concurrency
    console.log(`Initializing with concurrency: ${concurrency}`);
    const { ask } = await getConfig({ concurrency });

    // 2. Initialize Caches and Validators
    const fileCache = new Map<string, OpenAI.Chat.Completions.ChatCompletionContentPart[]>();
    const validatorCache = new Map<string, any>();
    // @ts-ignore
    const ajv = new Ajv({ strict: false });

    const getFileContent = async (filePath: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> => {
        if (fileCache.has(filePath)) {
            return fileCache.get(filePath)!;
        }
        const content = await readPromptInput(filePath);
        fileCache.set(filePath, content);
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

    // Compile Output Template
    const outputDelegate = Handlebars.compile(outputTemplate, { noEscape: true });

    // 3. Read Data (CSV or JSON)
    const rows = await loadData(dataFilePath);

    console.log(`Found ${rows.length} rows to process.`);

    const queue = new PQueue({ concurrency });

    const tasks = rows.map((row, index) => {
        return queue.add(async () => {
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

                // 3. Prepare Row-Specific Options and Validators
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

                // Fallback for User Prompts if none provided
                if (userPrompts.length === 0) {
                    userPrompts = [[{ type: 'text', text: JSON.stringify(row, null, 2) }]];
                }

                // Interpolate Output Path (Sanitized)
                const sanitizedRow: Record<string, string> = {};
                for (const [key, val] of Object.entries(row)) {
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = sanitize(stringVal).replace(/\s+/g, '_');
                    sanitizedRow[key] = sanitized.substring(0, 50);
                }
                const baseOutputPath = outputDelegate(sanitizedRow);

                console.log(`[Row ${index}] Processing...`);

                await handler(ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, rowOptions, rowValidators);

            } catch (err) {
                console.error(`[Row ${index}] Error:`, err);
            }
        });
    });

    await Promise.all(tasks);
    console.log("All tasks completed.");
}

const handleUnifiedGeneration: RowHandler = async (ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, options, validators) => {
    // History of conversation (User + Assistant only)
    const persistentHistory: any[] = [];

    for (let i = 0; i < userPrompts.length; i++) {
        const stepIndex = i + 1;
        const promptParts = userPrompts[i];
        
        let currentOutputPath = getIndexedPath(baseOutputPath, stepIndex, userPrompts.length);

        // Determine Configuration for this step
        const stepOverride = options.stepOverrides?.[stepIndex];
        
        // System Prompt
        let currentSystemPrompt: string | null = (renderedSystemPrompts.steps[stepIndex] as string | undefined) ?? null;
        if (currentSystemPrompt === null) {
            currentSystemPrompt = renderedSystemPrompts.global || null;
        }

        // Schema / Validator
        let currentValidator = validators[stepIndex];
        let currentSchemaObj = stepOverride?.jsonSchema;

        if (!currentValidator && !currentSchemaObj) {
            currentValidator = validators['global'];
            currentSchemaObj = options.jsonSchema;
        }

        // Verify Command
        const currentVerifyCommand = stepOverride?.verifyCommand || options.verifyCommand;

        // Construct Messages for this API call
        const apiMessages: any[] = [];
        
        // 1. System Prompt (with Schema instruction if needed)
        if (currentSystemPrompt || currentSchemaObj) {
            let content = currentSystemPrompt || "";
            if (currentSchemaObj) {
                if (content) content += "\n\n";
                content += `You must output valid JSON that matches the following schema: ${JSON.stringify(currentSchemaObj)}`;
            }
            apiMessages.push({ role: 'system', content });
        }

        // 2. History
        apiMessages.push(...persistentHistory);

        // 3. Current User Prompt
        apiMessages.push({ role: 'user', content: promptParts });

        // --- Unified Generation & Validation Loop ---
        // We use LlmReQuerier if we have ANY validation requirements (Schema OR Verify Command)
        // OR if we just want to use the standard retry mechanism for robustness.
        
        const querier = new LlmReQuerier(ask);

        try {
            const result = await querier.query(
                [...apiMessages],
                async (responseString, info) => {
                    let data: any = responseString;
                    let contentToWrite = responseString;

                    // 1. JSON Parsing & Schema Validation
                    if (currentSchemaObj) {
                        try {
                            data = JSON.parse(responseString);
                            contentToWrite = JSON.stringify(data, null, 2); // Normalize formatting
                        } catch (e) {
                            throw new LlmQuerierError("Response was not valid JSON.", 'JSON_PARSE_ERROR', null, responseString);
                        }

                        const valid = currentValidator(data);
                        if (!valid) {
                            const errors = currentValidator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                            throw new LlmQuerierError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR', currentValidator.errors, responseString);
                        }
                    }

                    // 2. Verify Command Validation
                    if (currentVerifyCommand) {
                        // Write to temp file (or actual output path) to verify
                        await ensureDir(currentOutputPath);
                        await fsPromises.writeFile(currentOutputPath, contentToWrite);

                        const cmd = currentVerifyCommand.replace('{{file}}', currentOutputPath);
                        try {
                            await execPromise(cmd);
                        } catch (error: any) {
                            // Command failed (non-zero exit code)
                            const stderr = error.stderr || error.stdout || error.message;
                            throw new LlmQuerierError(
                                `Verification command failed:\n${stderr}\n\nPlease fix the content based on this error.`,
                                'CUSTOM_ERROR',
                                null,
                                responseString
                            );
                        }
                    }

                    return { data, contentToWrite };
                },
                {
                    model: options.model,
                    response_format: currentSchemaObj ? { type: "json_object" } : undefined,
                    // If aspect ratio is provided, we assume image generation is desired if no schema is present
                    modalities: (!currentSchemaObj && options.aspectRatio) ? ['image', 'text'] : undefined,
                    image_config: (!currentSchemaObj && options.aspectRatio) ? { aspect_ratio: options.aspectRatio } : undefined
                }
            );

            // If we didn't write it during verification (or if verification wasn't run), write it now.
            // Note: If verification ran, we already wrote it, but writing again ensures consistency.
            
            // Special handling for Image Generation (which returns a different structure if not using JSON mode)
            // However, LlmReQuerier currently assumes text response. 
            // If we are in Image Mode (no schema, aspect ratio set), the responseString passed to callback is text.
            // But `ask` returns a full object. LlmReQuerier extracts content.
            // If the model returns images, content might be null or empty string in standard OpenAI response, 
            // but our `ask` wrapper returns the full response object.
            // Wait, LlmReQuerier extracts `completion.choices[0]?.message?.content`.
            // If we are doing image generation, we need to handle that.
            
            // Current LlmReQuerier logic:
            // const llmResponseString = completion.choices[0]?.message?.content;
            
            // If we are doing pure image generation (no text), content is null.
            // LlmReQuerier throws "LLM returned no response content."
            
            // FIX: If we are in image generation mode, we shouldn't use LlmReQuerier validation loop 
            // UNLESS we want to validate the image (which is hard).
            // For now, if aspect ratio is set AND no schema/verify command, we skip LlmReQuerier?
            // But the user might want to verify the image file exists?
            
            // Let's stick to the logic: If schema OR verify command is present, use LlmReQuerier.
            // Otherwise, use standard flow (which handles images).
            
            if (currentSchemaObj || currentVerifyCommand) {
                // We are in Text/JSON mode
                await ensureDir(currentOutputPath);
                await fsPromises.writeFile(currentOutputPath, result.contentToWrite);
                console.log(`[Row ${index}] Step ${stepIndex} Saved to ${currentOutputPath}`);

                persistentHistory.push({ role: 'user', content: promptParts });
                persistentHistory.push({ role: 'assistant', content: result.contentToWrite });
            } else {
                // Standard Mode (Text or Image without verification)
                // We fall back to the original logic for Images/Simple Text to avoid breaking Image Gen
                
                const askOptions: any = {
                    messages: [...apiMessages]
                };

                if (options.model) askOptions.model = options.model;
                if (options.aspectRatio) {
                    askOptions.modalities = ['image', 'text'];
                    askOptions.image_config = { aspect_ratio: options.aspectRatio };
                }

                const response = await ask(askOptions);
                const parsed = responseSchema.parse(response);
                const message = parsed.choices[0].message;
                const textContent = message.content;
                const images = message.images;

                if (textContent) {
                    await ensureDir(currentOutputPath);
                    await fsPromises.writeFile(currentOutputPath, textContent);
                    console.log(`[Row ${index}] Step ${stepIndex} Text saved to ${currentOutputPath}`);
                }

                if (images && images.length > 0) {
                    const imageUrl = images[0].image_url.url;
                    let buffer: Buffer;
                    if (imageUrl.startsWith('http')) {
                        const imgRes = await fetch(imageUrl);
                        const arrayBuffer = await imgRes.arrayBuffer();
                        buffer = Buffer.from(arrayBuffer);
                    } else {
                        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
                        buffer = Buffer.from(base64Data, 'base64');
                    }
                    await ensureDir(currentOutputPath);
                    await fsPromises.writeFile(currentOutputPath, buffer);
                    console.log(`[Row ${index}] Step ${stepIndex} Image saved to ${currentOutputPath}`);
                }

                persistentHistory.push({ role: 'user', content: promptParts });
                if (textContent) persistentHistory.push({ role: 'assistant', content: textContent });
                else if (images && images.length > 0) persistentHistory.push({ role: 'assistant', content: "Image generated." });
            }

        } catch (error) {
            console.error(`[Row ${index}] Step ${stepIndex} Failed after retries:`, error);
            throw error;
        }
    }
};

export async function runAction(
    dataFilePath: string,
    templateFilePaths: string[],
    outputTemplate: string,
    options: ActionOptions
) {
    try {
        await processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handleUnifiedGeneration);
    } catch (error) {
        console.error("Fatal Error:", error);
        throw error;
    }
}
