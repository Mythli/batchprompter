import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import csv from 'csv-parser';
import sanitize from 'sanitize-filename';
import { getConfig } from "./getConfig.js";
import { z } from 'zod';
import PQueue from 'p-queue';
import Handlebars from 'handlebars';
import { LlmReQuerier, LlmQuerierError } from './llmReQuerier.js';
import Ajv from 'ajv';
// Helper to ensure directory exists
async function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
}
// Helper to read prompt input (file or directory)
async function readPromptInput(inputPath) {
    const stats = await fsPromises.stat(inputPath);
    if (stats.isDirectory()) {
        const files = await fsPromises.readdir(inputPath);
        files.sort();
        const contents = await Promise.all(files.map(async (file) => {
            if (file.startsWith('.'))
                return null;
            const filePath = path.join(inputPath, file);
            const fileStats = await fsPromises.stat(filePath);
            if (fileStats.isFile()) {
                return fsPromises.readFile(filePath, 'utf-8');
            }
            return null;
        }));
        return contents.filter((c) => c !== null).join('\n\n');
    }
    else {
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
function getIndexedPath(basePath, stepIndex, totalSteps) {
    if (totalSteps <= 1)
        return basePath;
    const ext = path.extname(basePath);
    const name = path.basename(basePath, ext);
    const dir = path.dirname(basePath);
    return path.join(dir, `${name}_${stepIndex}${ext}`);
}
async function loadData(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
            throw new Error('JSON file must contain an array of objects.');
        }
        return data;
    }
    else {
        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => rows.push(data))
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
        return rows;
    }
}
function renderPath(pathTemplate, context) {
    const delegate = Handlebars.compile(pathTemplate, { noEscape: true });
    return delegate(context);
}
async function processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handler) {
    const concurrency = options.concurrency;
    // 1. Initialize Config with Concurrency
    console.log(`Initializing with concurrency: ${concurrency}`);
    const { ask } = await getConfig({ concurrency });
    // 2. Initialize Caches and Validators
    const fileCache = new Map();
    const validatorCache = new Map();
    // @ts-ignore
    const ajv = new Ajv({ strict: false });
    const getFileContent = async (filePath) => {
        if (fileCache.has(filePath)) {
            return fileCache.get(filePath);
        }
        const content = await readPromptInput(filePath);
        fileCache.set(filePath, content);
        return content;
    };
    const getValidator = async (filePath) => {
        if (validatorCache.has(filePath)) {
            return validatorCache.get(filePath);
        }
        const content = await getFileContent(filePath);
        const schemaObj = JSON.parse(content);
        const validator = ajv.compile(schemaObj);
        validatorCache.set(filePath, validator);
        return validator;
    };
    // Compile Output Template (this is usually static relative to row data, but we compile it once per row anyway in the loop logic below to be safe, or we can compile it here if we assume output path structure is static template)
    // Actually, outputTemplate is a string like "out/{{id}}/file.txt". We compile it once.
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
                let userPrompts = [];
                if (templateFilePaths.length > 0) {
                    for (const tPath of templateFilePaths) {
                        const resolvedPath = renderPath(tPath, row);
                        const content = await getFileContent(resolvedPath);
                        const rendered = Handlebars.compile(content, { noEscape: true })(row);
                        userPrompts.push(rendered);
                    }
                }
                // 2. Global System Prompt
                let globalSystemPrompt = null;
                if (options.system) {
                    const resolvedPath = renderPath(options.system, row);
                    const content = await getFileContent(resolvedPath);
                    globalSystemPrompt = Handlebars.compile(content, { noEscape: true })(row);
                }
                // 3. Prepare Row-Specific Options and Validators
                const rowValidators = {};
                const rowOptions = {
                    ...options,
                    stepOverrides: {}
                };
                // Global Schema
                if (options.schema) {
                    const resolvedPath = renderPath(options.schema, row);
                    const content = await getFileContent(resolvedPath);
                    rowOptions.jsonSchema = JSON.parse(content);
                    rowValidators['global'] = await getValidator(resolvedPath);
                }
                // Step Overrides
                const stepSystemPrompts = {};
                if (options.stepOverrides) {
                    for (const [stepStr, config] of Object.entries(options.stepOverrides)) {
                        const step = parseInt(stepStr, 10);
                        const newConfig = { ...config };
                        // Step System Prompt
                        if (config.system) {
                            const resolvedPath = renderPath(config.system, row);
                            const content = await getFileContent(resolvedPath);
                            stepSystemPrompts[step] = Handlebars.compile(content, { noEscape: true })(row);
                            // We don't update newConfig.system content here, as it's used for path. 
                            // The handler receives the rendered string via `renderedSystemPrompts`.
                        }
                        // Step Schema
                        if (config.schema) {
                            const resolvedPath = renderPath(config.schema, row);
                            const content = await getFileContent(resolvedPath);
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
                    userPrompts = [JSON.stringify(row, null, 2)];
                }
                // Interpolate Output Path (Sanitized)
                const sanitizedRow = {};
                for (const [key, val] of Object.entries(row)) {
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = sanitize(stringVal).replace(/\s+/g, '_');
                    sanitizedRow[key] = sanitized.substring(0, 50);
                }
                const baseOutputPath = outputDelegate(sanitizedRow);
                console.log(`[Row ${index}] Processing...`);
                await handler(ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, rowOptions, rowValidators);
            }
            catch (err) {
                console.error(`[Row ${index}] Error:`, err);
            }
        });
    });
    await Promise.all(tasks);
    console.log("All tasks completed.");
}
const handleUnifiedGeneration = async (ask, renderedSystemPrompts, userPrompts, baseOutputPath, index, options, validators) => {
    // History of conversation (User + Assistant only)
    const persistentHistory = [];
    for (let i = 0; i < userPrompts.length; i++) {
        const stepIndex = i + 1;
        const prompt = userPrompts[i];
        let currentOutputPath = getIndexedPath(baseOutputPath, stepIndex, userPrompts.length);
        // Determine Configuration for this step
        const stepOverride = options.stepOverrides?.[stepIndex];
        // System Prompt
        let currentSystemPrompt = renderedSystemPrompts.steps[stepIndex] ?? null;
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
        const apiMessages = [];
        // 1. System Prompt (with Schema instruction if needed)
        if (currentSystemPrompt || currentSchemaObj) {
            let content = currentSystemPrompt || "";
            if (currentSchemaObj) {
                if (content)
                    content += "\n\n";
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
                const validatedData = await querier.query([...apiMessages], // Pass a copy of the conversation history
                async (responseString, info) => {
                    let data;
                    try {
                        data = JSON.parse(responseString);
                    }
                    catch (e) {
                        throw new LlmQuerierError("Response was not valid JSON.", 'JSON_PARSE_ERROR', null, responseString);
                    }
                    const valid = currentValidator(data);
                    if (!valid) {
                        const errors = currentValidator.errors?.map((e) => `${e.instancePath} ${e.message}`).join(', ');
                        throw new LlmQuerierError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR', currentValidator.errors, responseString);
                    }
                    return data;
                }, {
                    model: options.model,
                    response_format: { type: "json_object" }
                });
                await ensureDir(currentOutputPath);
                await fsPromises.writeFile(currentOutputPath, JSON.stringify(validatedData, null, 2));
                console.log(`[Row ${index}] Step ${stepIndex} Validated JSON saved to ${currentOutputPath}`);
                // Update History
                persistentHistory.push({ role: 'user', content: prompt });
                persistentHistory.push({ role: 'assistant', content: JSON.stringify(validatedData) });
            }
            catch (error) {
                console.error(`[Row ${index}] Step ${stepIndex} Failed to generate valid JSON after retries:`, error);
                throw error;
            }
        }
        else {
            // --- Standard Mode (Text/Image) ---
            const askOptions = {
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
                let buffer;
                if (imageUrl.startsWith('http')) {
                    const imgRes = await fetch(imageUrl);
                    const arrayBuffer = await imgRes.arrayBuffer();
                    buffer = Buffer.from(arrayBuffer);
                }
                else {
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
            }
            else if (images && images.length > 0) {
                persistentHistory.push({ role: 'assistant', content: "Image generated." });
            }
            else {
                persistentHistory.push({ role: 'assistant', content: "" });
            }
        }
    }
};
export async function runAction(dataFilePath, templateFilePaths, outputTemplate, options) {
    try {
        await processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handleUnifiedGeneration);
    }
    catch (error) {
        console.error("Fatal Error:", error);
        throw error;
    }
}
