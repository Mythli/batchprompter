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
import { Parser } from 'json2csv';

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
    postProcessCommand?: string;
    aspectRatio?: string;
    outputTemplate?: string;
    outputColumn?: string;
}

interface ActionOptions {
    concurrency: number;
    aspectRatio?: string;
    model?: string;
    system?: string;
    schema?: string;
    jsonSchema?: any;
    verifyCommand?: string;
    postProcessCommand?: string;
    outputColumn?: string;
    dataOutput?: string;
    stepOverrides?: Record<number, StepConfig>;
}

type RowHandler = (
    ask: AskGptFunction,
    renderedSystemPrompts: { global: string | null, steps: Record<number, string> },
    userPrompts: OpenAI.Chat.Completions.ChatCompletionContentPart[][],
    baseOutputPath: string,
    index: number,
    options: ActionOptions,
    validators: Record<string, any>,
    row: Record<string, any>
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

function aggressiveSanitize(input: string): string {
    // 1. Remove anything that is NOT a-z, A-Z, 0-9
    let sanitized = input.replace(/[^a-zA-Z0-9]/g, '');
    
    // 2. Remove leading numbers
    sanitized = sanitized.replace(/^[0-9]+/, '');
    
    // 3. Truncate to 50 chars
    return sanitized.substring(0, 50);
}

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

    // Compile Output Template (Global)
    const outputDelegate = outputTemplate ? Handlebars.compile(outputTemplate, { noEscape: true }) : null;

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

                await handler(ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, rowOptions, rowValidators, row);

            } catch (err) {
                console.error(`[Row ${index}] Error:`, err);
            }
        });
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

const handleUnifiedGeneration: RowHandler = async (ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, options, validators, row) => {
    // History of conversation (User + Assistant only)
    const persistentHistory: any[] = [];

    for (let i = 0; i < userPrompts.length; i++) {
        const stepIndex = i + 1;
        const promptParts = userPrompts[i];
        
        // Determine Configuration for this step
        const stepOverride = options.stepOverrides?.[stepIndex];

        // Determine Output Path
        let currentOutputPath: string | null = null;

        // 1. Check Step Override
        if (stepOverride?.outputTemplate) {
             const delegate = Handlebars.compile(stepOverride.outputTemplate, { noEscape: true });
             // Sanitize row for path generation
             const sanitizedRow: Record<string, string> = {};
             for (const [key, val] of Object.entries(row)) {
                 const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                 const sanitized = aggressiveSanitize(stringVal);
                 sanitizedRow[key] = sanitized;
             }
             currentOutputPath = delegate(sanitizedRow);
        } 
        // 2. Fallback to Global
        else if (baseOutputPath) {
            currentOutputPath = getIndexedPath(baseOutputPath, stepIndex, userPrompts.length);
        }

        // Determine Output Column
        let currentOutputColumn = stepOverride?.outputColumn || options.outputColumn;
        if (currentOutputColumn) {
            const delegate = Handlebars.compile(currentOutputColumn, { noEscape: true });
            currentOutputColumn = delegate(row);
        }
        
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
        // Post Process Command
        const currentPostProcessCommand = stepOverride?.postProcessCommand || options.postProcessCommand;

        // Aspect Ratio
        const currentAspectRatio = stepOverride?.aspectRatio || options.aspectRatio;

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
        
        let contentForColumn: string | null = null;

        if (currentSchemaObj || currentVerifyCommand) {
            // We use LlmReQuerier ONLY if we have validation requirements (Schema OR Verify Command)
            const querier = new LlmReQuerier(ask);

            try {
                const queryOptions: any = {
                    model: options.model,
                    response_format: currentSchemaObj ? { type: "json_object" } : undefined,
                };

                // Pass image options if needed
                if (currentAspectRatio) {
                    queryOptions.modalities = ['image', 'text'];
                    queryOptions.image_config = { aspect_ratio: currentAspectRatio };
                }

                const result = await querier.query(
                    [...apiMessages],
                    async (message: any, info) => {
                        let data: any = message.content;
                        let contentToWrite = message.content;
                        const images = message.images;

                        // 1. JSON Parsing & Schema Validation (Only if content is present)
                        if (currentSchemaObj) {
                            if (!contentToWrite) {
                                throw new LlmQuerierError("Expected JSON response but got empty content (maybe an image?).", 'CUSTOM_ERROR', null, null);
                            }
                            try {
                                data = JSON.parse(contentToWrite);
                                contentToWrite = JSON.stringify(data, null, 2); // Normalize formatting
                            } catch (e) {
                                throw new LlmQuerierError("Response was not valid JSON.", 'JSON_PARSE_ERROR', null, contentToWrite);
                            }

                            const valid = currentValidator(data);
                            if (!valid) {
                                const errors = currentValidator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                                throw new LlmQuerierError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR', currentValidator.errors, contentToWrite);
                            }
                        }

                        // 2. Image Handling (if images are present)
                        if (images && images.length > 0) {
                            const imageUrl = images[0].image_url.url;
                            contentToWrite = imageUrl; // For column output
                            
                            // If we have an output path, we need to save the image there (or to a temp file for verification)
                            if (currentOutputPath || currentVerifyCommand) {
                                let buffer: Buffer;
                                if (imageUrl.startsWith('http')) {
                                    const imgRes = await fetch(imageUrl);
                                    const arrayBuffer = await imgRes.arrayBuffer();
                                    buffer = Buffer.from(arrayBuffer);
                                } else {
                                    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
                                    buffer = Buffer.from(base64Data, 'base64');
                                }

                                // If verification is needed, we MUST save to a file now
                                const savePath = currentOutputPath || path.join(path.dirname(baseOutputPath || '.'), `temp_verify_${index}_${stepIndex}.png`);
                                await ensureDir(savePath);
                                await fsPromises.writeFile(savePath, buffer);
                                
                                // If we just saved to a temp path for verification, we might want to track that
                                if (!currentOutputPath) {
                                    // It's a temp file, effectively
                                }
                            }
                        }

                        // 3. Verify Command Validation
                        if (currentVerifyCommand) {
                            // Write to temp file (or actual output path) to verify
                            // If no output path is defined, we create a temp one
                            // Note: For images, we already saved it above. For text, we save it here.
                            
                            const verifyPath = currentOutputPath || path.join(path.dirname(baseOutputPath || '.'), `temp_verify_${index}_${stepIndex}.${images ? 'png' : 'txt'}`);
                            
                            if (!images) {
                                await ensureDir(verifyPath);
                                await fsPromises.writeFile(verifyPath, contentToWrite);
                            }

                            // Compile the command template with Handlebars to resolve variables like {{color}}
                            const cmdTemplate = Handlebars.compile(currentVerifyCommand, { noEscape: true });
                            const cmd = cmdTemplate({ ...row, file: verifyPath });
                            
                            console.log(`[Row ${index}] Step ${stepIndex} 🔍 Verifying with command: ${cmd}`);

                            try {
                                const { stdout, stderr } = await execPromise(cmd);
                                
                                if (stdout && stdout.trim()) {
                                    console.log(`[Row ${index}] Step ${stepIndex} 🟢 Verify STDOUT:\n${stdout.trim()}`);
                                }
                                if (stderr && stderr.trim()) {
                                    console.log(`[Row ${index}] Step ${stepIndex} 🟡 Verify STDERR:\n${stderr.trim()}`);
                                }
                                
                            } catch (error: any) {
                                // Command failed (non-zero exit code)
                                const stdout = error.stdout;
                                const stderr = error.stderr;
                                const message = error.message;

                                console.error(`[Row ${index}] Step ${stepIndex} 🔴 Verify Failed!`);
                                if (stdout && stdout.trim()) {
                                    console.log(`[Row ${index}] Step ${stepIndex} 🔴 Verify STDOUT:\n${stdout.trim()}`);
                                }
                                if (stderr && stderr.trim()) {
                                    console.error(`[Row ${index}] Step ${stepIndex} 🔴 Verify STDERR:\n${stderr.trim()}`);
                                } else if (message) {
                                    console.error(`[Row ${index}] Step ${stepIndex} 🔴 Verify Error Message:\n${message}`);
                                }

                                // Construct feedback for LLM
                                const feedback = stderr || stdout || message;

                                throw new LlmQuerierError(
                                    `Verification command failed:\n${feedback}\n\nPlease fix the content based on this error.`,
                                    'CUSTOM_ERROR',
                                    null,
                                    contentToWrite
                                );
                            }
                        }

                        return { data, contentToWrite };
                    },
                    queryOptions
                );

                contentForColumn = result.contentToWrite;

                // If we didn't write it during verification (or if verification wasn't run), write it now.
                // Note: For images, we might have already written it during the verification block logic above.
                // But if verification wasn't run, we need to write it here.
                if (currentOutputPath && !currentVerifyCommand) {
                    // If it's an image, we need to re-download/save? 
                    // Or we can optimize. For now, let's keep it simple and consistent with the "Standard Mode" logic below.
                    // Actually, result.contentToWrite for images is the URL.
                    
                    if (result.contentToWrite && (result.contentToWrite.startsWith('http') || result.contentToWrite.startsWith('data:image'))) {
                         // It's likely an image URL
                         let buffer: Buffer;
                         if (result.contentToWrite.startsWith('http')) {
                             const imgRes = await fetch(result.contentToWrite);
                             const arrayBuffer = await imgRes.arrayBuffer();
                             buffer = Buffer.from(arrayBuffer);
                         } else {
                             const base64Data = result.contentToWrite.replace(/^data:image\/\w+;base64,/, "");
                             buffer = Buffer.from(base64Data, 'base64');
                         }
                         await ensureDir(currentOutputPath);
                         await fsPromises.writeFile(currentOutputPath, buffer);
                         console.log(`[Row ${index}] Step ${stepIndex} Image saved to ${currentOutputPath}`);
                    } else {
                        await ensureDir(currentOutputPath);
                        await fsPromises.writeFile(currentOutputPath, result.contentToWrite);
                        console.log(`[Row ${index}] Step ${stepIndex} Saved to ${currentOutputPath}`);
                    }
                }

                persistentHistory.push({ role: 'user', content: promptParts });
                
                // Add assistant response to history
                // If it was an image, we use a placeholder or the content if available
                // Note: LlmReQuerier already adds the successful response to its internal history for retries,
                // but we need to update our `persistentHistory` for the NEXT step in the loop.
                const historyContent = (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)) || "Image generated.";
                persistentHistory.push({ role: 'assistant', content: historyContent });

            } catch (error) {
                console.error(`[Row ${index}] Step ${stepIndex} Failed after retries:`, error);
                throw error;
            }
        } else {
            // Standard Mode (Text or Image without verification)
            // We use ask() directly to support Images and simple Text without validation loops.
            
            try {
                const askOptions: any = {
                    messages: [...apiMessages]
                };

                if (options.model) askOptions.model = options.model;
                if (currentAspectRatio) {
                    askOptions.modalities = ['image', 'text'];
                    askOptions.image_config = { aspect_ratio: currentAspectRatio };
                }

                const response = await ask(askOptions);
                const parsed = responseSchema.parse(response);
                const message = parsed.choices[0].message;
                const textContent = message.content;
                const images = message.images;

                if (textContent) {
                    contentForColumn = textContent;
                    if (currentOutputPath) {
                        await ensureDir(currentOutputPath);
                        await fsPromises.writeFile(currentOutputPath, textContent);
                        console.log(`[Row ${index}] Step ${stepIndex} Text saved to ${currentOutputPath}`);
                    }
                }

                if (images && images.length > 0) {
                    const imageUrl = images[0].image_url.url;
                    contentForColumn = imageUrl;
                    
                    if (currentOutputPath) {
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
                }

                persistentHistory.push({ role: 'user', content: promptParts });
                if (textContent) persistentHistory.push({ role: 'assistant', content: textContent });
                else if (images && images.length > 0) persistentHistory.push({ role: 'assistant', content: "Image generated." });
            } catch (error) {
                console.error(`[Row ${index}] Step ${stepIndex} Failed:`, error);
                throw error;
            }
        }

        // 4. Post-Process Command
        if (currentPostProcessCommand) {
            let filePathForCommand = currentOutputPath;
            let isTemp = false;

            // If we don't have a file path yet (because output was only to column), create a temp one
            if (!filePathForCommand && contentForColumn) {
                isTemp = true;
                const ext = (contentForColumn.startsWith('http') || contentForColumn.startsWith('data:')) ? '.png' : '.txt';
                filePathForCommand = path.join(path.dirname(baseOutputPath || '.'), `temp_post_${index}_${stepIndex}${ext}`);
                
                // Write content
                if (contentForColumn.startsWith('http') || contentForColumn.startsWith('data:')) {
                     let buffer: Buffer;
                     if (contentForColumn.startsWith('http')) {
                         const imgRes = await fetch(contentForColumn);
                         const arrayBuffer = await imgRes.arrayBuffer();
                         buffer = Buffer.from(arrayBuffer);
                     } else {
                         const base64Data = contentForColumn.replace(/^data:image\/\w+;base64,/, "");
                         buffer = Buffer.from(base64Data, 'base64');
                     }
                     await ensureDir(filePathForCommand);
                     await fsPromises.writeFile(filePathForCommand, buffer);
                } else {
                    await ensureDir(filePathForCommand);
                    await fsPromises.writeFile(filePathForCommand, contentForColumn);
                }
            }

            if (filePathForCommand) {
                const cmdTemplate = Handlebars.compile(currentPostProcessCommand, { noEscape: true });
                // We pass the row data AND the file path
                const cmd = cmdTemplate({ ...row, file: filePathForCommand });
                
                console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running command: ${cmd}`);
                
                try {
                    const { stdout, stderr } = await execPromise(cmd);
                    if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
                    if (stderr && stderr.trim()) console.error(`[Row ${index}] Step ${stepIndex} STDERR:\n${stderr.trim()}`);
                } catch (error: any) {
                    console.error(`[Row ${index}] Step ${stepIndex} Command failed:`, error.message);
                    if (error.stderr) console.error(`[Row ${index}] Step ${stepIndex} STDERR:\n${error.stderr.trim()}`);
                }

                if (isTemp) {
                    try { await fsPromises.unlink(filePathForCommand); } catch (e) {}
                }
            }
        }

        if (currentOutputColumn && contentForColumn) {
            row[currentOutputColumn] = contentForColumn;
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
