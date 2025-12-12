import OpenAI from 'openai';
import path from 'path';
import { StepConfig, StepContext } from './types.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { ArtifactSaver } from './ArtifactSaver.js';
import { MessageBuilder } from './core/MessageBuilder.js';
import Handlebars from 'handlebars';
import util from 'util';
import { exec } from 'child_process';
import { aggressiveSanitize } from './utils/fileUtils.js';

const execPromise = util.promisify(exec);

export interface StepExecutionResult {
    historyMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    modelResult: any;
}

export class StepExecutor {

    constructor(
        private tmpDir: string,
        private messageBuilder: MessageBuilder
    ) {}

    async executeModel(
        stepContext: StepContext,
        viewContext: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        pluginContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        variationIndex?: number
    ): Promise<StepExecutionResult> {

        let effectiveUserPromptParts = pluginContentParts;

        const hasUserPrompt = config.userPromptParts.length > 0;
        const hasSystemPrompt = config.modelConfig.systemParts.length > 0;
        const hasModelPrompt = config.modelConfig.promptParts.length > 0;

        if (effectiveUserPromptParts.length === 0 && !hasSystemPrompt && !hasModelPrompt) {
             console.log(`[Row ${index}] Step ${stepIndex} No prompt and no content. Treating as pass-through.`);
             return {
                 historyMessage: { role: 'assistant', content: '' },
                 modelResult: {}
             };
        }

        if (!hasUserPrompt && !hasSystemPrompt && !hasModelPrompt && effectiveUserPromptParts.length > 0) {
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

        let strategy: GenerationStrategy = new StandardStrategy(
            stepContext.llm,
            this.messageBuilder
        );

        if (config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, stepContext);
        }

        const result = await strategy.execute(
            viewContext,
            index,
            stepIndex,
            config,
            effectiveUserPromptParts,
            history,
            undefined, // cacheSalt
            undefined, // outputPathOverride
            false, // skipCommands
            variationIndex // Pass variation index for filename generation
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
