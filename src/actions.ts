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

interface ActionOptions {
    concurrency: number;
    aspectRatio?: string;
    model?: string;
    system?: string;
    schema?: string;
    jsonSchema?: any;
}

type RowHandler = (
    ask: AskGptFunction,
    systemPrompt: string | null,
    userPrompts: string[],
    baseOutputPath: string,
    index: number,
    options: ActionOptions
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

    // Load Schema if provided
    if (options.schema) {
        console.log(`Loading JSON Schema from: ${options.schema}`);
        const schemaContent = await fsPromises.readFile(options.schema, 'utf-8');
        options.jsonSchema = JSON.parse(schemaContent);
    }

    // Compile Handlebars templates
    // noEscape: true ensures we don't HTML-escape characters in the prompt or path
    const userDelegates = userTemplates.map(t => Handlebars.compile(t, { noEscape: true }));
    const systemDelegate = systemTemplate ? Handlebars.compile(systemTemplate, { noEscape: true }) : null;
    const outputDelegate = Handlebars.compile(outputTemplate, { noEscape: true });

    // 3. Read Data (CSV or JSON)
    const rows = await loadData(dataFilePath);

    console.log(`Found ${rows.length} rows to process.`);

    const queue = new PQueue({ concurrency });

    const tasks = rows.map((row, index) => {
        return queue.add(async () => {
            try {
                // Prepare System Prompt
                const systemPrompt = systemDelegate ? systemDelegate(row) : null;

                // Prepare User Prompts
                let userPrompts: string[] = [];
                if (userDelegates.length > 0) {
                    userPrompts = userDelegates.map(d => d(row));
                } else if (systemPrompt) {
                    // Default to JSON row if system prompt exists but no user templates
                    userPrompts = [JSON.stringify(row, null, 2)];
                } else {
                    throw new Error("No user templates provided and no system template provided.");
                }

                // Interpolate Path (Sanitized)
                // We create a sanitized version of the row data for the filename generation
                // to ensure no invalid characters or overly long filenames are generated.
                const sanitizedRow: Record<string, string> = {};
                for (const [key, val] of Object.entries(row)) {
                    // Ensure val is a string for sanitization
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = sanitize(stringVal).replace(/\s+/g, '_');
                    sanitizedRow[key] = sanitized.substring(0, 50);
                }
                const baseOutputPath = outputDelegate(sanitizedRow);

                console.log(`[Row ${index}] Processing...`);

                await handler(ask, systemPrompt, userPrompts, baseOutputPath, index, options);

            } catch (err) {
                console.error(`[Row ${index}] Error:`, err);
            }
        });
    });

    await Promise.all(tasks);
    console.log("All tasks completed.");
}

const handleUnifiedGeneration: RowHandler = async (ask, systemPrompt, userPrompts, baseOutputPath, index, options) => {
    const messages: any[] = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
        if (options.jsonSchema) {
            messages.push({ role: 'system', content: `You must output valid JSON that matches the following schema: ${JSON.stringify(options.jsonSchema)}` });
        }
    }

    // Compile validator if schema is present
    let validate: any = null;
    if (options.jsonSchema) {
        // @ts-ignore
        const ajv = new Ajv({ strict: false });
        validate = ajv.compile(options.jsonSchema);
    }

    for (let i = 0; i < userPrompts.length; i++) {
        const prompt = userPrompts[i];
        messages.push({ role: 'user', content: prompt });

        let currentOutputPath = getIndexedPath(baseOutputPath, i + 1, userPrompts.length);

        if (options.jsonSchema) {
            // --- JSON Schema Mode (using LlmReQuerier) ---
            const querier = new LlmReQuerier(ask);
            
            // Force .json extension
            const ext = path.extname(currentOutputPath);
            if (ext !== '.json') {
                currentOutputPath = currentOutputPath.slice(0, -ext.length) + '.json';
            }

            try {
                const validatedData = await querier.query(
                    [...messages], // Pass a copy of the conversation history
                    async (responseString, info) => {
                        let data;
                        try {
                            data = JSON.parse(responseString);
                        } catch (e) {
                            throw new LlmQuerierError("Response was not valid JSON.", 'JSON_PARSE_ERROR', null, responseString);
                        }

                        const valid = validate(data);
                        if (!valid) {
                            const errors = validate.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                            throw new LlmQuerierError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR', validate.errors, responseString);
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
                console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} Validated JSON saved to ${currentOutputPath}`);

                // Update history with the valid JSON string
                messages.push({ role: 'assistant', content: JSON.stringify(validatedData) });

            } catch (error) {
                console.error(`[Row ${index}] Step ${i + 1} Failed to generate valid JSON after retries:`, error);
                throw error;
            }

        } else {
            // --- Standard Mode (Text/Image) ---
            const askOptions: any = {
                messages: [...messages]
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
                console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} Text saved to ${currentOutputPath}`);
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
                console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} Image saved to ${imagePath}`);
            }

            if (!textContent && (!images || images.length === 0)) {
                console.warn(`[Row ${index}] Step ${i + 1} No content returned.`);
            }

            // Update history
            if (textContent) {
                messages.push({ role: 'assistant', content: textContent });
            } else if (images && images.length > 0) {
                messages.push({ role: 'assistant', content: "Image generated." });
            } else {
                messages.push({ role: 'assistant', content: "" });
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
