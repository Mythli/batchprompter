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

export interface StepExecutionResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    modelResult: any; // The raw result (string or object)
}

export class StepExecutor {
    
    constructor(
        private llm: LlmClient,
        private tmpDir: string,
        private concurrency: number,
        private services: PluginServices,
        private pluginRegistry: PluginRegistry
    ) {}

    /**
     * Executes the Model generation part of a step.
     * Plugins are assumed to have been executed by ActionRunner.
     */
    async executeModel(
        viewContext: Record<string, any>, // The merged context (row + history)
        index: number,
        stepIndex: number,
        config: StepConfig,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        pluginContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): Promise<StepExecutionResult> {
        
        // Prepend plugin content to user prompt
        // Note: In ActionRunner, we might have already combined these for preprocessing.
        // However, executeModel expects to receive the *final* parts to send to the model.
        // If ActionRunner passed preprocessed parts as `pluginContentParts`, we use them.
        // But wait, ActionRunner passes `effectiveParts` which includes userPromptParts.
        // So we should treat `pluginContentParts` here as the *full* effective user prompt if it comes from ActionRunner's new logic.
        
        // To maintain backward compatibility or clarity:
        // If the caller (ActionRunner) has already merged and preprocessed everything into `pluginContentParts`,
        // we should use that. 
        
        // Let's assume `pluginContentParts` passed here IS the full effective prompt.
        let effectiveUserPromptParts = pluginContentParts;

        // 2. Check for "Pass-through" Mode
        // We check config.userPromptParts just to see if *originally* there was a prompt, 
        // but for execution we use effectiveUserPromptParts.
        const hasUserPrompt = config.userPromptParts.length > 0;
        const hasSystemPrompt = config.modelConfig.systemParts.length > 0;
        const hasModelPrompt = config.modelConfig.promptParts.length > 0;

        // If effective parts are empty, and no system/model prompt, then we have nothing.
        if (effectiveUserPromptParts.length === 0 && !hasSystemPrompt && !hasModelPrompt) {
             throw new Error(`Step ${stepIndex} has no prompt and no plugin output. Nothing to process.`);
        }
        
        // Special case: If we have NO model interaction intended (just saving plugin output),
        // we usually detect that by lack of prompts. 
        // However, with preprocessors, we might have expanded a URL in the prompt.
        // So "Pass-through" mode is tricky. 
        // If the user provided a prompt (even just a URL), they expect the model to run.
        // Pass-through is strictly for "Plugin -> File" without LLM.
        
        if (!hasUserPrompt && !hasSystemPrompt && !hasModelPrompt && effectiveUserPromptParts.length > 0) {
             // This logic was: "If no prompt, save plugin output".
             // But if effectiveUserPromptParts has content (from plugins), we save it.
             console.log(`[Row ${index}] Step ${stepIndex} No prompt detected. Saving plugin output directly...`);
            
            const savedPaths = await this.saveContentParts(
                effectiveUserPromptParts, 
                config.resolvedOutputDir || this.tmpDir, 
                config.outputBasename || 'output',
                config.outputExtension
            );

            if (config.postProcessCommand) {
                for (const filePath of savedPaths) {
                    await this.executeCommand(config.postProcessCommand, viewContext, index, stepIndex, filePath);
                }
            }

            return {
                historyMessage: {
                    role: 'assistant',
                    content: `[Saved ${effectiveUserPromptParts.length} items from plugins]`
                },
                modelResult: {}
            };
        }

        // 3. Select Strategy
        let strategy: GenerationStrategy = new StandardStrategy(this.llm, config.modelConfig.model);
        
        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this.llm);
        }

        // 4. Execute Strategy
        const result = await strategy.execute(
            viewContext,
            index,
            stepIndex,
            config,
            effectiveUserPromptParts,
            history
        );

        return {
            historyMessage: result.historyMessage,
            modelResult: result.raw !== undefined ? result.raw : result.columnValue
        };
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
            
            let ext = forcedExtension;
            if (!ext) {
                if (part.type === 'image_url') ext = '.jpg';
                else if (part.type === 'input_audio') ext = `.${part.input_audio.format}`;
                else ext = '.txt';
            }

            const filename = parts.length === 1 
                ? `${basename}${ext}`
                : `${basename}_${i}${ext}`;
                
            const savePath = path.join(outputDir, filename);

            if (part.type === 'text') {
                await ArtifactSaver.save(part.text, savePath);
            } else if (part.type === 'image_url') {
                await ArtifactSaver.save(part.image_url.url, savePath);
            } else if (part.type === 'input_audio') {
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
