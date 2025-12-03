// 
import OpenAI from 'openai';
import path from 'path';
import { LlmClient } from 'llm-fns';
import { StepConfig } from './types.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { PluginRegistry } from './plugins/PluginRegistry.js';
import { PluginServices } from './plugins/types.js';
import { ArtifactSaver } from './ArtifactSaver.js';
import Handlebars from 'handlebars';
import util from 'util';
import { exec } from 'child_process';
import { aggressiveSanitize } from './utils/fileUtils.js';

const execPromise = util.promisify(exec);

export class StepExecutor {
    
    constructor(
        private llm: LlmClient,
        private tmpDir: string,
        private concurrency: number,
        private services: PluginServices,
        private pluginRegistry: PluginRegistry
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
        
        // 1. Execute Plugins (Content Providers)
        let effectiveUserPromptParts = [...config.userPromptParts];
        
        for (const [name, pluginConfig] of Object.entries(config.plugins)) {
            const plugin = this.pluginRegistry.get(name);
            if (plugin) {
                try {
                    const contentParts = await plugin.execute({
                        row,
                        stepIndex,
                        config: pluginConfig,
                        llm: this.llm,
                        globalConfig: {
                            tmpDir: this.tmpDir,
                            concurrency: this.concurrency
                        },
                        services: this.services,
                        // Pass the pre-calculated paths
                        outputDirectory: config.resolvedOutputDir,
                        tempDirectory: config.resolvedTempDir || this.tmpDir, // Fallback to root tmp if something goes wrong
                        outputBasename: config.outputBasename,
                        outputExtension: config.outputExtension
                    });
                    effectiveUserPromptParts = [...contentParts, ...effectiveUserPromptParts];
                } catch (e: any) {
                    console.error(`[Row ${index}] Step ${stepIndex} Plugin '${name}' failed:`, e.message);
                    throw e; // Fail the step if a plugin fails
                }
            }
        }

        // 2. Check for "Pass-through" Mode
        // If there are no user prompts and no system prompts, we assume the user just wants to save the plugin output.
        const hasUserPrompt = config.userPromptParts.length > 0;
        const hasSystemPrompt = config.modelConfig.systemParts.length > 0;
        const hasModelPrompt = config.modelConfig.promptParts.length > 0;

        if (!hasUserPrompt && !hasSystemPrompt && !hasModelPrompt) {
            if (effectiveUserPromptParts.length === 0) {
                throw new Error(`Step ${stepIndex} has no prompt and no plugin output. Nothing to process.`);
            }

            console.log(`[Row ${index}] Step ${stepIndex} No prompt detected. Saving plugin output directly...`);
            
            // Save content directly
            const savedPaths = await this.saveContentParts(
                effectiveUserPromptParts, 
                config.resolvedOutputDir || this.tmpDir, 
                config.outputBasename || 'output',
                config.outputExtension
            );

            // Execute command if present
            if (config.postProcessCommand) {
                for (const filePath of savedPaths) {
                    await this.executeCommand(config.postProcessCommand, row, index, stepIndex, filePath);
                }
            }

            return {
                role: 'assistant',
                content: `[Saved ${effectiveUserPromptParts.length} items from plugins]`
            };
        }

        // 3. Select Strategy
        let strategy: GenerationStrategy = new StandardStrategy(this.llm, config.modelConfig.model);
        
        // Wrap in Candidate Strategy if needed
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this.llm);
        }

        // 4. Execute Strategy
        const result = await strategy.execute(
            row,
            index,
            stepIndex,
            config,
            effectiveUserPromptParts,
            history
        );

        if (config.outputColumn && result.columnValue) {
            row[config.outputColumn] = result.columnValue;
        }

        return result.historyMessage;
    }

    private async saveContentParts(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        outputDir: string,
        basename: string,
        forcedExtension?: string
    ): Promise<string[]> {
        const savedPaths: string[] = [];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            
            // Determine extension
            let ext = forcedExtension;
            if (!ext) {
                if (part.type === 'image_url') ext = '.jpg'; // Default to jpg for images if unknown
                else if (part.type === 'input_audio') ext = `.${part.input_audio.format}`;
                else ext = '.txt';
            }

            // Construct filename
            // If there's only one part, use the basename directly. Otherwise append index.
            const filename = parts.length === 1 
                ? `${basename}${ext}`
                : `${basename}_${i}${ext}`;
                
            const savePath = path.join(outputDir, filename);

            if (part.type === 'text') {
                await ArtifactSaver.save(part.text, savePath);
            } else if (part.type === 'image_url') {
                await ArtifactSaver.save(part.image_url.url, savePath);
            } else if (part.type === 'input_audio') {
                // input_audio.data is base64
                const buffer = Buffer.from(part.input_audio.data, 'base64');
                await ArtifactSaver.save(buffer, savePath);
            }
            savedPaths.push(savePath);
        }
        return savedPaths;
    }

    private async executeCommand(commandTemplate: string, row: Record<string, any>, index: number, stepIndex: number, filePath: string) {
        const cmdTemplate = Handlebars.compile(commandTemplate, { noEscape: true });
        const sanitizedRow: Record<string, string> = {};
        for (const [key, val] of Object.entries(row)) {
            const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
            sanitizedRow[key] = aggressiveSanitize(stringVal);
        }
        const cmd = cmdTemplate({ ...sanitizedRow, file: filePath });
        console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running command: ${cmd}`);
        try {
            const { stdout } = await execPromise(cmd);
            if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
        } catch (error: any) {
            console.error(`[Row ${index}] Step ${stepIndex} Command failed:`, error.message);
        }
    }
}
