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

// Helper to ensure directory exists
async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
}

// Helper to read prompt input (file or directory)
async function readPromptInput(inputPath: string): Promise<string> {
    const stats = await fsPromises.stat(inputPath);
    if (stats.isDirectory()) {
        const files = await fsPromises.readdir(inputPath);
        files.sort();
        
        const contents = await Promise.all(files.map(async (file) => {
            if (file.startsWith('.')) return null;
            const filePath = path.join(inputPath, file);
            const fileStats = await fsPromises.stat(filePath);
            if (fileStats.isFile()) {
                return fsPromises.readFile(filePath, 'utf-8');
            }
            return null;
        }));
        
        return contents.filter((c): c is string => c !== null).join('\n\n');
    } else {
        return fsPromises.readFile(inputPath, 'utf-8');
    }
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
}

interface ActionOptions {
    concurrency: number;
    aspectRatio?: string;
    model?: string;
    system?: string;
    schema?: string;
    jsonSchema?: any;
    stepOverrides?: Record<number, StepConfig>;
}

type RowHandler = (
    ask: AskGptFunction,
    renderedSystemPrompts: { global: string | null, steps: Record<number, string> },
    userPrompts: string[],
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

    // 2. Read Template Files
    const userTemplates = await Promise.all(templateFilePaths.map(p => readPromptInput(p)));
    const systemTemplate = options.system ? await readPromptInput(options.system) : null;

    // Load Global Schema if provided
    if (options.schema) {
        console.log(`Loading JSON Schema from: ${options.schema}`);
        const schemaContent = await fsPromises.readFile(options.schema, 'utf-8');
        options.jsonSchema = JSON.parse(schemaContent);
    }

    // Load Step Overrides
    if (options.stepOverrides) {
        for (const [stepStr, config] of Object.entries(options.stepOverrides)) {
            const step = parseInt(stepStr, 10);
            if (config.system) {
                config.system = await readPromptInput(config.system);
            }
            if (config.schema) {
                console.log(`Loading Step ${step} JSON Schema from: ${config.schema}`);
                const content = await fsPromises.readFile(config.schema, 'utf-8');
                config.jsonSchema = JSON.parse(content);
            }
        }
    }

    // Compile Handlebars templates
    const userDelegates = userTemplates.map(t => Handlebars.compile(t, { noEscape: true }));
    const systemDelegate = systemTemplate ? Handlebars.compile(systemTemplate, { noEscape: true }) : null;
    const outputDelegate = Handlebars.compile(outputTemplate, { noEscape: true });

    const stepSystemDelegates: Record<number, Handlebars.TemplateDelegate> = {};
    if (options.stepOverrides) {
        for (const [stepStr, config] of Object.entries(options.stepOverrides)) {
             if (config.system) {
                 stepSystemDelegates[parseInt(stepStr)] = Handlebars.compile(config.system, { noEscape: true });
             }
        }
    }

    // Compile Validators
    // @ts-ignore
    const ajv = new Ajv({ strict: false });
    const validators: Record<string, any> = {};
    
    if (options.jsonSchema) {
        validators['global'] = ajv.compile(options.jsonSchema);
    }
    if (options.stepOverrides) {
        for (const [stepStr, config] of Object.entries(options.stepOverrides)) {
            if (config.jsonSchema) {
                validators[stepStr] = ajv.compile(config.jsonSchema);
            }
        }
    }

    // 3. Read Data (CSV or JSON)
    const rows = await loadData(dataFilePath);

    console.log(`Found ${rows.length} rows to process.`);

    const queue = new PQueue({ concurrency });

    const tasks = rows.map((row, index) => {
        return queue.add(async () => {
            try {
                // Prepare System Prompts (Rendered)
                const globalSystemPrompt = systemDelegate ? systemDelegate(row) : null;
                const stepSystemPrompts: Record<number, string> = {};
                for (const [step, delegate] of Object.entries(stepSystemDelegates)) {
                    stepSystemPrompts[parseInt(step)] = delegate(row);
                }

                const renderedSystemPrompts = {
                    global: globalSystemPrompt,
                    steps: stepSystemPrompts
                };

                // Prepare User Prompts
                let userPrompts: string[] = [];
                if (userDelegates.length > 0) {
                    userPrompts = userDelegates.map(d => d(row));
                } else if (globalSystemPrompt) {
                    // Default to JSON row if system prompt exists but no user templates
                    userPrompts = [JSON.stringify(row, null, 2)];
                } else {
                    // Fallback if no user templates and no global system prompt, 
                    // but maybe we have step overrides?
                    userPrompts = [JSON.stringify(row, null, 2)];
                }

                // Interpolate Path (Sanitized)
                const sanitizedRow: Record<string, string> = {};
                for (const [key, val] of Object.entries(row)) {
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = sanitize(stringVal).replace(/\s+/g, '_');
                    sanitizedRow[key] = sanitized.substring(0, 50);
                }
                const baseOutputPath = outputDelegate(sanitizedRow);

                console.log(`[Row ${index}] Processing...`);

                await handler(ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, options, validators);

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
        const prompt = userPrompts[i];
        
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
        apiMessages.push({ role: 'user', content: prompt });

        if (currentSchemaObj) {
            // --- JSON Schema Mode (using LlmReQuerier) ---
            const querier = new LlmReQuerier(ask);
            
            // Force .json extension
            const ext = path.extname(currentOutputPath);
            if (ext !== '.json') {
                currentOutputPath = currentOutputPath.slice(0, -ext.length) + '.json';
            }

            try {
                const validatedData = await querier.query(
                    [...apiMessages], // Pass a copy of the conversation history
                    async (responseString, info) => {
                        let data;
                        try {
                            data = JSON.parse(responseString);
                        } catch (e) {
                            throw new LlmQuerierError("Response was not valid JSON.", 'JSON_PARSE_ERROR', null, responseString);
                        }

                        const valid = currentValidator(data);
                        if (!valid) {
                            const errors = currentValidator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                            throw new LlmQuerierError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR', currentValidator.errors, responseString);
                        }
                        return data;
                    },
                    {
                        model: options.model,
                        response_format: { type: "json_object" }
                    }
                );

                await ensureDir(currentOutputPath);
                await fsPromises.writeFile(currentOutputPath, JSON.stringify(validatedData, null, 2));
                console.log(`[Row ${index}] Step ${stepIndex} Validated JSON saved to ${currentOutputPath}`);

                // Update History
                persistentHistory.push({ role: 'user', content: prompt });
                persistentHistory.push({ role: 'assistant', content: JSON.stringify(validatedData) });

            } catch (error) {
                console.error(`[Row ${index}] Step ${stepIndex} Failed to generate valid JSON after retries:`, error);
                throw error;
            }

        } else {
            // --- Standard Mode (Text/Image) ---
            const askOptions: any = {
                messages: [...apiMessages]
            };

            if (options.model) {
                askOptions.model = options.model;
            }

            // If aspect ratio is provided, we assume the user might want images and the model supports it via modalities.
            if (options.aspectRatio) {
                askOptions.modalities = ['image', 'text'];
                askOptions.image_config = {
                    aspect_ratio: options.aspectRatio
                };
            }

            const response = await ask(askOptions);
            const parsed = responseSchema.parse(response);
            const message = parsed.choices[0].message;

            const textContent = message.content;
            const images = message.images;
            
            // Handle Text
            if (textContent) {
                await ensureDir(currentOutputPath);
                await fsPromises.writeFile(currentOutputPath, textContent);
                console.log(`[Row ${index}] Step ${stepIndex} Text saved to ${currentOutputPath}`);
            }

            // Handle Images
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

                // Determine image path (swap extension to .png if it's not an image extension)
                let imagePath = currentOutputPath;
                const ext = path.extname(imagePath).toLowerCase();
                if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
                    imagePath = path.join(path.dirname(imagePath), path.basename(imagePath, ext) + '.png');
                }

                await ensureDir(imagePath);
                await fsPromises.writeFile(imagePath, buffer);
                console.log(`[Row ${index}] Step ${stepIndex} Image saved to ${imagePath}`);
            }

            if (!textContent && (!images || images.length === 0)) {
                console.warn(`[Row ${index}] Step ${stepIndex} No content returned.`);
            }

            // Update history
            persistentHistory.push({ role: 'user', content: prompt });
            if (textContent) {
                persistentHistory.push({ role: 'assistant', content: textContent });
            } else if (images && images.length > 0) {
                persistentHistory.push({ role: 'assistant', content: "Image generated." });
            } else {
                persistentHistory.push({ role: 'assistant', content: "" });
            }
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
