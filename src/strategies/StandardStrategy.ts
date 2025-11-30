import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import fsPromises from 'fs/promises';
import { LlmClient, LlmRetryError } from 'llm-fns';

import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
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
        private llm: LlmClient,
        private model: string | undefined
    ) {}

    private extractUserText(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]): string {
        return parts.map(p => {
            if (p.type === 'text') return p.text;
            return '[Image/Audio Input]';
        }).join('\n');
    }

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands: boolean = false
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
            // ReQuery Mode using llm-fns promptTextRetry
            
            if (config.aspectRatio) {
                // Image Generation with manual retry loop
                const maxRetries = 3;
                let lastError: any;
                
                for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                        const currentMessages = [...apiMessages];
                        if (lastError) {
                            currentMessages.push({ role: 'user', content: lastError.message });
                        }

                        const response = await this.llm.prompt({
                            messages: currentMessages,
                            model: this.model,
                            cacheSalt: cacheSalt,
                            modalities: ['image', 'text'],
                            image_config: { aspect_ratio: config.aspectRatio }
                        });

                        const parsed = responseSchema.parse(response);
                        const message = parsed.choices[0].message;
                        const images = message.images;
                        
                        if (!images || images.length === 0) {
                            throw new Error("No image generated.");
                        }
                        
                        const imageUrl = images[0].image_url.url;
                        
                        // Verify Command
                        if (config.verifyCommand && !skipCommands) {
                            const verifyPath = effectiveOutputPath || path.join(path.dirname(effectiveOutputPath || '.'), `temp_verify_${index}_${stepIndex}.png`);
                            await ArtifactSaver.save(imageUrl, verifyPath);
                            
                            const cmdTemplate = Handlebars.compile(config.verifyCommand, { noEscape: true });
                            const cmd = cmdTemplate({ ...row, file: verifyPath });
                            
                            console.log(`[Row ${index}] Step ${stepIndex} 🔍 Verifying Image: ${cmd}`);
                            
                            try {
                                const { stdout } = await execPromise(cmd);
                                if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} 🟢 Verify STDOUT:\n${stdout.trim()}`);
                            } catch (error: any) {
                                const feedback = error.stderr || error.stdout || error.message;
                                throw new Error(`Verification failed: ${feedback}`);
                            }
                        }
                        
                        // Success
                        contentForColumn = imageUrl;
                        assistantResponseContent = "Image generated.";
                        
                        if (effectiveOutputPath && (!config.verifyCommand || skipCommands)) {
                            await ArtifactSaver.save(imageUrl, effectiveOutputPath);
                            console.log(`[Row ${index}] Step ${stepIndex} Image saved to ${effectiveOutputPath}`);
                        }
                        
                        break; // Exit loop
                        
                    } catch (error: any) {
                        lastError = error;
                        if (attempt === maxRetries) throw error;
                        console.log(`[Row ${index}] Step ${stepIndex} Image generation/verification failed, retrying... (${error.message})`);
                    }
                }
            } else {
                // Text/JSON Generation with promptTextRetry
                
                // Define Validator Function to be reused in Feedback Loop
                const validator = async (text: string, info: any) => {
                    let content = text;
                    let data: any;

                    // 1. JSON Parsing & Schema Validation
                    if (config.jsonSchema) {
                        if (!content) {
                            throw new LlmRetryError("Expected JSON response but got empty content.", 'CUSTOM_ERROR');
                        }
                        try {
                            data = JSON.parse(content);
                            content = JSON.stringify(data, null, 2);
                        } catch (e) {
                            throw new LlmRetryError("Response was not valid JSON.", 'JSON_PARSE_ERROR');
                        }

                        const valid = config.validator(data);
                        if (!valid) {
                            const errors = config.validator.errors?.map((e: any) => `${e.instancePath} ${e.message}`).join(', ');
                            throw new LlmRetryError(`JSON does not match schema: ${errors}`, 'CUSTOM_ERROR');
                        }
                    }

                    // 2. Verify Command
                    if (config.verifyCommand && !skipCommands) {
                        // Use a temp path for verification to avoid race conditions or overwriting final output prematurely
                        const verifyPath = path.join(path.dirname(effectiveOutputPath || '.'), `temp_verify_${index}_${stepIndex}_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
                        
                        await ArtifactSaver.save(content, verifyPath);

                        const cmdTemplate = Handlebars.compile(config.verifyCommand, { noEscape: true });
                        const cmd = cmdTemplate({ ...row, file: verifyPath });
                        
                        console.log(`[Row ${index}] Step ${stepIndex} 🔍 Verifying: ${cmd}`);

                        try {
                            const { stdout } = await execPromise(cmd);
                            if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} 🟢 Verify STDOUT:\n${stdout.trim()}`);
                        } catch (error: any) {
                            const feedback = error.stderr || error.stdout || error.message;
                            throw new LlmRetryError(
                                `Verification command failed:\n${feedback}\n\nPlease fix the content based on this error.`,
                                'CUSTOM_ERROR'
                            );
                        } finally {
                            // Clean up temp file
                            try { await fsPromises.unlink(verifyPath); } catch (e) {}
                        }
                    }

                    return content;
                };

                // Initial Generation
                let currentText = await this.llm.promptTextRetry({
                    messages: apiMessages,
                    model: this.model,
                    cacheSalt: cacheSalt,
                    response_format: config.jsonSchema ? { type: "json_object" } : undefined,
                    validate: validator
                });

                // Feedback Loop
                if (config.feedbackLoops > 0 && config.feedbackPrompt) {
                    for (let i = 0; i < config.feedbackLoops; i++) {
                        console.log(`[Row ${index}] Step ${stepIndex} 🔄 Feedback Loop ${i+1}/${config.feedbackLoops}`);

                        // 1. Critique
                        const critiqueMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                            { role: 'system', content: 'You are an expert critic. Analyze the provided content against the criteria and provide specific, actionable improvements.' },
                            { role: 'user', content: `Original Request:\n${this.extractUserText(userPromptParts)}\n\nCurrent Draft:\n${currentText}\n\nCritique Criteria:\n${config.feedbackPrompt}` }
                        ];

                        const critique = await this.llm.prompt({
                            messages: critiqueMessages,
                            model: config.feedbackModel || this.model,
                            cacheSalt: `${cacheSalt}_critique_${i}`
                        });
                        
                        const critiqueText = critique.choices[0].message.content;
                        console.log(`[Row ${index}] Step ${stepIndex} 📝 Critique: ${critiqueText?.substring(0, 100)}...`);

                        // 2. Refine (with Validation)
                        const refinementMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                            ...apiMessages,
                            { role: 'assistant', content: currentText },
                            { role: 'user', content: `Critique:\n${critiqueText}\n\nPlease rewrite the content to address this critique while maintaining all original requirements (including JSON schema if applicable).` }
                        ];

                        currentText = await this.llm.promptTextRetry({
                            messages: refinementMessages,
                            model: this.model,
                            cacheSalt: `${cacheSalt}_refine_${i}`,
                            response_format: config.jsonSchema ? { type: "json_object" } : undefined,
                            validate: validator
                        });
                    }
                }

                contentForColumn = currentText;
                assistantResponseContent = currentText;

                // Save Final Output
                if (effectiveOutputPath && (!config.verifyCommand || skipCommands)) {
                    await ArtifactSaver.save(currentText, effectiveOutputPath);
                    console.log(`[Row ${index}] Step ${stepIndex} Saved to ${effectiveOutputPath}`);
                }
            }

        } else {
            // Standard Mode (No validation loop)
            const askOptions: any = {
                messages: [...apiMessages],
                cacheSalt: cacheSalt
            };
            if (this.model) askOptions.model = this.model;
            if (config.aspectRatio) {
                askOptions.modalities = ['image', 'text'];
                askOptions.image_config = { aspect_ratio: config.aspectRatio };
            }

            const response = await this.llm.prompt(askOptions);
            const parsed = responseSchema.parse(response);
            const message = parsed.choices[0].message;
            const textContent = message.content;
            const images = message.images;

            if (textContent) {
                contentForColumn = textContent;
                assistantResponseContent = textContent;
                
                // Feedback Loop for Standard Mode (Text only)
                if (config.feedbackLoops > 0 && config.feedbackPrompt && !config.aspectRatio) {
                    let currentText = textContent;
                    for (let i = 0; i < config.feedbackLoops; i++) {
                        console.log(`[Row ${index}] Step ${stepIndex} 🔄 Feedback Loop ${i+1}/${config.feedbackLoops}`);

                        // 1. Critique
                        const critiqueMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                            { role: 'system', content: 'You are an expert critic. Analyze the provided content against the criteria and provide specific, actionable improvements.' },
                            { role: 'user', content: `Original Request:\n${this.extractUserText(userPromptParts)}\n\nCurrent Draft:\n${currentText}\n\nCritique Criteria:\n${config.feedbackPrompt}` }
                        ];

                        const critique = await this.llm.prompt({
                            messages: critiqueMessages,
                            model: config.feedbackModel || this.model,
                            cacheSalt: `${cacheSalt}_critique_${i}`
                        });
                        
                        const critiqueText = critique.choices[0].message.content;

                        // 2. Refine (No Validation)
                        const refinementMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                            ...apiMessages,
                            { role: 'assistant', content: currentText },
                            { role: 'user', content: `Critique:\n${critiqueText}\n\nPlease rewrite the content to address this critique.` }
                        ];

                        const refined = await this.llm.prompt({
                            messages: refinementMessages,
                            model: this.model,
                            cacheSalt: `${cacheSalt}_refine_${i}`
                        });
                        
                        if (refined.choices[0].message.content) {
                            currentText = refined.choices[0].message.content;
                        }
                    }
                    contentForColumn = currentText;
                    assistantResponseContent = currentText;
                }

                if (effectiveOutputPath) {
                    await ArtifactSaver.save(contentForColumn, effectiveOutputPath);
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
        if (config.postProcessCommand && !skipCommands) {
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
                    const { stdout } = await execPromise(cmd);
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
