import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import fsPromises from 'fs/promises';

import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { AskGptFunction } from '../createCachedGptAsk.js';
import { LlmReQuerier, LlmQuerierError } from '../llmReQuerier.js';
import { ArtifactSaver } from '../ArtifactSaver.js';
import { ResolvedStepConfig } from '../StepConfigurator.js';

const execPromise = util.promisify(exec);

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

export class StandardStrategy implements GenerationStrategy {
    constructor(
        private ask: AskGptFunction,
        private model: string | undefined
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string
    ): Promise<GenerationResult> {
        
        // Construct Messages
        const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        
        if (config.systemPrompt || config.jsonSchema) {
            let content = config.systemPrompt || "";
            if (config.jsonSchema) {
                if (content) content += "\n\n";
                content += `You must output valid JSON that matches the following schema: ${JSON.stringify(config.jsonSchema)}`;
            }
            apiMessages.push({ role: 'system', content });
        }

        apiMessages.push(...history);
        apiMessages.push({ role: 'user', content: userPromptParts });

        let contentForColumn: string | null = null;
        let assistantResponseContent: string = "";
        
        // Determine effective output path (override takes precedence)
        const effectiveOutputPath = outputPathOverride || config.outputPath;

        // --- Execution Logic ---
        if (config.jsonSchema || config.verifyCommand) {
            // ReQuery Mode
            const querier = new LlmReQuerier(this.ask);
            const queryOptions: any = {
                model: this.model,
                response_format: config.jsonSchema ? { type: "json_object" } : undefined,
                cacheSalt: cacheSalt
            };

            if (config.aspectRatio) {
                queryOptions.modalities = ['image', 'text'];
                queryOptions.image_config = { aspect_ratio: config.aspectRatio };
            }

            const result = await querier.query(
                [...apiMessages],
                async (message: any, info) => {
                    let data: any = message.content;
                    let contentToWrite = message.content;
                    const images = message.images;

                    // 1. JSON Parsing & Schema Validation
                    if (config.jsonSchema) {
                        if (!contentToWrite) {
                            throw new LlmQuerierError("Expected JSON response but got empty content.", 'CUSTOM_ERROR', null, null);
                        }
                        try {
                            data = JSON.parse(contentToWrite);
                            contentToWrite = JSON.stringify(data, null, 2);
                        } catch (e) {
                            throw new LlmQuerierError("Response was not valid JSON.", 'JSON_PARSE_ERROR', null, contentToWrite);
                        }

                        const valid = config.validator(data);
                        if (!valid) {
                            const errors = config.validator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                            throw new LlmQuerierError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR', config.validator.errors, contentToWrite);
                        }
                    }

                    // 2. Image Handling
                    if (images && images.length > 0) {
                        const imageUrl = images[0].image_url.url;
                        contentToWrite = imageUrl;
                        
                        if (effectiveOutputPath || config.verifyCommand) {
                            // Save temp for verification or final output
                            const savePath = effectiveOutputPath || path.join(path.dirname(effectiveOutputPath || '.'), `temp_verify_${index}_${stepIndex}.png`);
                            await ArtifactSaver.save(imageUrl, savePath);
                        }
                    }

                    // 3. Verify Command
                    if (config.verifyCommand) {
                        const verifyPath = effectiveOutputPath || path.join(path.dirname(effectiveOutputPath || '.'), `temp_verify_${index}_${stepIndex}.${images ? 'png' : 'txt'}`);
                        
                        if (!images) {
                            await ArtifactSaver.save(contentToWrite, verifyPath);
                        }

                        const cmdTemplate = Handlebars.compile(config.verifyCommand, { noEscape: true });
                        const cmd = cmdTemplate({ ...row, file: verifyPath });
                        
                        console.log(`[Row ${index}] Step ${stepIndex} 🔍 Verifying: ${cmd}`);

                        try {
                            const { stdout, stderr } = await execPromise(cmd);
                            if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} 🟢 Verify STDOUT:\n${stdout.trim()}`);
                        } catch (error: any) {
                            const feedback = error.stderr || error.stdout || error.message;
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
            assistantResponseContent = (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)) || "Image generated.";

            // Save Final Output if not already handled by verify logic (or if verify logic used a temp path)
            if (effectiveOutputPath && !config.verifyCommand) {
                await ArtifactSaver.save(result.contentToWrite, effectiveOutputPath);
                console.log(`[Row ${index}] Step ${stepIndex} Saved to ${effectiveOutputPath}`);
            }

        } else {
            // Standard Mode
            const askOptions: any = {
                messages: [...apiMessages],
                cacheSalt: cacheSalt
            };
            if (this.model) askOptions.model = this.model;
            if (config.aspectRatio) {
                askOptions.modalities = ['image', 'text'];
                askOptions.image_config = { aspect_ratio: config.aspectRatio };
            }

            const response = await this.ask(askOptions);
            const parsed = responseSchema.parse(response);
            const message = parsed.choices[0].message;
            const textContent = message.content;
            const images = message.images;

            if (textContent) {
                contentForColumn = textContent;
                assistantResponseContent = textContent;
                if (effectiveOutputPath) {
                    await ArtifactSaver.save(textContent, effectiveOutputPath);
                    console.log(`[Row ${index}] Step ${stepIndex} Text saved to ${effectiveOutputPath}`);
                }
            }

            if (images && images.length > 0) {
                const imageUrl = images[0].image_url.url;
                contentForColumn = imageUrl;
                assistantResponseContent = "Image generated.";
                
                if (effectiveOutputPath) {
                    await ArtifactSaver.save(imageUrl, effectiveOutputPath);
                    console.log(`[Row ${index}] Step ${stepIndex} Image saved to ${effectiveOutputPath}`);
                }
            }
        }

        // Post Process
        if (config.postProcessCommand) {
            let filePathForCommand = effectiveOutputPath;
            let isTemp = false;

            if (!filePathForCommand && contentForColumn) {
                isTemp = true;
                const ext = (contentForColumn.startsWith('http') || contentForColumn.startsWith('data:')) ? '.png' : '.txt';
                filePathForCommand = path.join(path.dirname(effectiveOutputPath || '.'), `temp_post_${index}_${stepIndex}${ext}`);
                await ArtifactSaver.save(contentForColumn, filePathForCommand);
            }

            if (filePathForCommand) {
                const cmdTemplate = Handlebars.compile(config.postProcessCommand, { noEscape: true });
                const cmd = cmdTemplate({ ...row, file: filePathForCommand });
                
                console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running command: ${cmd}`);
                
                try {
                    const { stdout, stderr } = await execPromise(cmd);
                    if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
                } catch (error: any) {
                    console.error(`[Row ${index}] Step ${stepIndex} Command failed:`, error.message);
                }

                if (isTemp) {
                    try { await fsPromises.unlink(filePathForCommand); } catch (e) {}
                }
            }
        }

        return { 
            historyMessage: { role: 'assistant', content: assistantResponseContent },
            columnValue: contentForColumn
        };
    }
}
