"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAction = runAction;
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const sanitize_filename_1 = __importDefault(require("sanitize-filename"));
const getConfig_js_1 = require("./getConfig.js");
const zod_1 = require("zod");
const p_queue_1 = __importDefault(require("p-queue"));
const handlebars_1 = __importDefault(require("handlebars"));
// Helper to ensure directory exists
async function ensureDir(filePath) {
    const dir = path_1.default.dirname(filePath);
    await promises_1.default.mkdir(dir, { recursive: true });
}
// Response schema to extract image URL
const responseSchema = zod_1.z.object({
    choices: zod_1.z.array(zod_1.z.object({
        message: zod_1.z.object({
            content: zod_1.z.string().nullable(),
            images: zod_1.z.array(zod_1.z.object({
                image_url: zod_1.z.object({
                    url: zod_1.z.string()
                })
            })).optional()
        })
    })).min(1)
});
function getIndexedPath(basePath, stepIndex, totalSteps) {
    if (totalSteps <= 1)
        return basePath;
    const ext = path_1.default.extname(basePath);
    const name = path_1.default.basename(basePath, ext);
    const dir = path_1.default.dirname(basePath);
    return path_1.default.join(dir, `${name}_${stepIndex}${ext}`);
}
async function loadData(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === '.json') {
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
            throw new Error('JSON file must contain an array of objects.');
        }
        return data;
    }
    else {
        const rows = [];
        await new Promise((resolve, reject) => {
            fs_1.default.createReadStream(filePath)
                .pipe((0, csv_parser_1.default)())
                .on('data', (data) => rows.push(data))
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
        return rows;
    }
}
async function processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handler) {
    const concurrency = options.concurrency;
    // 1. Initialize Config with Concurrency
    console.log(`Initializing with concurrency: ${concurrency}`);
    const { ask } = await (0, getConfig_js_1.getConfig)({ concurrency });
    // 2. Read Template Files
    const userTemplates = await Promise.all(templateFilePaths.map(p => promises_1.default.readFile(p, 'utf-8')));
    const systemTemplate = options.system ? await promises_1.default.readFile(options.system, 'utf-8') : null;
    // Compile Handlebars templates
    // noEscape: true ensures we don't HTML-escape characters in the prompt or path
    const userDelegates = userTemplates.map(t => handlebars_1.default.compile(t, { noEscape: true }));
    const systemDelegate = systemTemplate ? handlebars_1.default.compile(systemTemplate, { noEscape: true }) : null;
    const outputDelegate = handlebars_1.default.compile(outputTemplate, { noEscape: true });
    // 3. Read Data (CSV or JSON)
    const rows = await loadData(dataFilePath);
    console.log(`Found ${rows.length} rows to process.`);
    const queue = new p_queue_1.default({ concurrency });
    const tasks = rows.map((row, index) => {
        return queue.add(async () => {
            try {
                // Prepare System Prompt
                const systemPrompt = systemDelegate ? systemDelegate(row) : null;
                // Prepare User Prompts
                let userPrompts = [];
                if (userDelegates.length > 0) {
                    userPrompts = userDelegates.map(d => d(row));
                }
                else if (systemPrompt) {
                    // Default to JSON row if system prompt exists but no user templates
                    userPrompts = [JSON.stringify(row, null, 2)];
                }
                else {
                    throw new Error("No user templates provided and no system template provided.");
                }
                // Interpolate Path (Sanitized)
                // We create a sanitized version of the row data for the filename generation
                // to ensure no invalid characters or overly long filenames are generated.
                const sanitizedRow = {};
                for (const [key, val] of Object.entries(row)) {
                    // Ensure val is a string for sanitization
                    const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                    const sanitized = (0, sanitize_filename_1.default)(stringVal).replace(/\s+/g, '_');
                    sanitizedRow[key] = sanitized.substring(0, 50);
                }
                const baseOutputPath = outputDelegate(sanitizedRow);
                console.log(`[Row ${index}] Processing...`);
                await handler(ask, systemPrompt, userPrompts, baseOutputPath, index, options);
            }
            catch (err) {
                console.error(`[Row ${index}] Error:`, err);
            }
        });
    });
    await Promise.all(tasks);
    console.log("All tasks completed.");
}
const handleUnifiedGeneration = async (ask, systemPrompt, userPrompts, baseOutputPath, index, options) => {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    for (let i = 0; i < userPrompts.length; i++) {
        const prompt = userPrompts[i];
        messages.push({ role: 'user', content: prompt });
        const askOptions = {
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
        const currentOutputPath = getIndexedPath(baseOutputPath, i + 1, userPrompts.length);
        // Handle Text
        if (textContent) {
            await ensureDir(currentOutputPath);
            await promises_1.default.writeFile(currentOutputPath, textContent);
            console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} Text saved to ${currentOutputPath}`);
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
            const ext = path_1.default.extname(imagePath).toLowerCase();
            if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
                imagePath = path_1.default.join(path_1.default.dirname(imagePath), path_1.default.basename(imagePath, ext) + '.png');
            }
            await ensureDir(imagePath);
            await promises_1.default.writeFile(imagePath, buffer);
            console.log(`[Row ${index}] Step ${i + 1}/${userPrompts.length} Image saved to ${imagePath}`);
        }
        if (!textContent && (!images || images.length === 0)) {
            console.warn(`[Row ${index}] Step ${i + 1} No content returned.`);
        }
        // Update history
        if (textContent) {
            messages.push({ role: 'assistant', content: textContent });
        }
        else if (images && images.length > 0) {
            messages.push({ role: 'assistant', content: "Image generated." });
        }
        else {
            messages.push({ role: 'assistant', content: "" });
        }
    }
};
async function runAction(dataFilePath, templateFilePaths, outputTemplate, options) {
    try {
        await processBatch(dataFilePath, templateFilePaths, outputTemplate, options, handleUnifiedGeneration);
    }
    catch (error) {
        console.error("Fatal Error:", error);
        throw error;
    }
}
