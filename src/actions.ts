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

// Helper to ensure directory exists
async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
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
    const userTemplates = await Promise.all(templateFilePaths.map(p => fsPromises.readFile(p, 'utf-8')));
    const systemTemplate = options.system ? await fsPromises.readFile(options.system, 'utf-8') : null;

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

const handleTextGeneration: RowHandler = async (ask, systemPrompt, userPrompts, baseOutputPath, index, options) => {
    const messages: any[] = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    for (let i = 0; i < userPrompts.length; i++) {
        const prompt = userPrompts[i];
        messages.push({ role: 'user', content: prompt });

        const askOptions: any = {
            messages: [...messages]
        };

        if (options.model) {
            askOptions.model = options.model;
        }

        const response = await ask(askOptions);
        const parsed = responseSchema.parse(response);
        const message = parsed.choices[0].message;

        const textContent = message.content;
        const currentOutputPath = getIndexedPath(baseOutputPath, i + 1, userPrompts.length);

        if (textContent) {
            await ensureDir(currentOutputPath);
            await fsPromises.writeFile(currentOutputPath, textContent);
            console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} saved to ${currentOutputPath}`);
            
            // Add assistant response to history
            messages.push({ role: 'assistant', content: textContent });
        } else {
            console.warn(`[Row ${index}] Step ${i + 1} No text content returned.`);
            messages.push({ role: 'assistant', content: "" });
        }
    }
};

const handleImageGeneration: RowHandler = async (ask, systemPrompt, userPrompts, baseOutputPath, index, options) => {
    const messages: any[] = [];

    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    for (let i = 0; i < userPrompts.length; i++) {
        const prompt = userPrompts[i];
        messages.push({ role: 'user', content: prompt });

        const askOptions: any = {
            messages: [...messages],
            modalities: ['image', 'text'],
            image_config: {
                aspect_ratio: options.aspectRatio || '3:2'
            }
        };

        if (options.model) {
            askOptions.model = options.model;
        }

        const response = await ask(askOptions);
        const parsed = responseSchema.parse(response);
        const message = parsed.choices[0].message;

        const images = message.images;
        const currentOutputPath = getIndexedPath(baseOutputPath, i + 1, userPrompts.length);

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
            console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} Image saved to ${currentOutputPath}`);
        } else {
            console.warn(`[Row ${index}] Step ${i + 1} No image returned.`);
        }

        // Update history
        if (message.content) {
            messages.push({ role: 'assistant', content: message.content });
        } else {
            messages.push({ role: 'assistant', content: "Image generated." });
        }
    }
};

export async function runAction(
    mode: 'text' | 'image',
    dataFilePath: string,
    templateFilePaths: string[],
    outputTemplate: string,
    options: ActionOptions
) {
    try {
        if (mode === 'text') {
            await processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handleTextGeneration);
        } else if (mode === 'image') {
            await processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handleImageGeneration);
        }
    } catch (error) {
        console.error("Fatal Error:", error);
        throw error;
    }
}
