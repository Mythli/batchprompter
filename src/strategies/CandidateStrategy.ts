import OpenAI from 'openai';
import path from 'path';
import Handlebars from 'handlebars';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import { LlmClient } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { ResolvedStepConfig } from '../StepConfigurator.js';
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';

const execPromise = util.promisify(exec);

export class CandidateStrategy implements GenerationStrategy {
    constructor(
        private standardStrategy: StandardStrategy,
        private llm: LlmClient
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        cacheSalt?: string | number,
        outputPathOverride?: string,
        skipCommands?: boolean
    ): Promise<GenerationResult> {
        const candidateCount = config.candidates;
        console.log(`[Row ${index}] Step ${stepIndex} Generating ${candidateCount} candidates...`);

        const promises: Promise<GenerationResult & { candidateIndex: number, outputPath: string | null }>[] = [];

        for (let i = 0; i < candidateCount; i++) {
            // Determine a unique output path for this candidate in the tmpDir
            let candidateOutputPath: string | null = null;

            // Default behavior: Save to tmpDir with structured naming
            // Format: {tmpDir}/{rowIndex}_{stepIndex}_cand_{candidateIndex}.{ext}
            
            let ext = '.txt';
            if (config.aspectRatio) ext = '.png'; // Likely image
            
            const filename = `${String(index).padStart(3, '0')}_${String(stepIndex).padStart(2, '0')}_cand_${i}${ext}`;
            candidateOutputPath = path.join(config.tmpDir, filename);

            // We use the loop index as the cacheSalt to ensure unique generations
            const salt = `${cacheSalt || ''}_cand_${i}`;

            // If noCandidateCommand is true, we skip commands during candidate generation
            const shouldSkipCommands = config.noCandidateCommand || skipCommands;

            promises.push(
                this.standardStrategy.execute(
                    row, index, stepIndex, config, userPromptParts, history, salt, candidateOutputPath || undefined, shouldSkipCommands
                ).then(res => ({ ...res, candidateIndex: i, outputPath: candidateOutputPath }))
            );
        }

        const results = await Promise.allSettled(promises);
        const successfulCandidates = results
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<GenerationResult & { candidateIndex: number, outputPath: string | null }>).value);

        if (successfulCandidates.length === 0) {
            throw new Error(`All ${candidateCount} candidates failed to generate.`);
        }

        let winner = successfulCandidates[0];

        // If we have a judge and more than one candidate, run the judge
        if (config.judgeModel && successfulCandidates.length > 1) {
            console.log(`[Row ${index}] Step ${stepIndex} Judging ${successfulCandidates.length} candidates with ${config.judgeModel}...`);
            try {
                winner = await this.judgeCandidates(successfulCandidates, config, userPromptParts, index, stepIndex);
                console.log(`[Row ${index}] Step ${stepIndex} Judge selected candidate #${winner.candidateIndex + 1}`);
            } catch (e: any) {
                console.error(`[Row ${index}] Step ${stepIndex} Judging failed, falling back to first candidate. Error: ${e.message}`);
            }
        }

        // If the winner has an output path (it was saved to tmpDir), we should copy it to the final output path
        if (config.outputPath && winner.outputPath) {
            const fs = await import('fs/promises');
            try {
                await ensureDir(config.outputPath);
                await fs.copyFile(winner.outputPath, config.outputPath);
                console.log(`[Row ${index}] Step ${stepIndex} Winner (Candidate ${winner.candidateIndex + 1}) copied to ${config.outputPath}`);
                
                // If commands were skipped during candidate generation, we MUST run them now on the final file
                if (config.noCandidateCommand && config.postProcessCommand) {
                    const cmdTemplate = Handlebars.compile(config.postProcessCommand, { noEscape: true });
                    const cmd = cmdTemplate({ ...row, file: config.outputPath });
                    
                    console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running deferred command on winner: ${cmd}`);
                    
                    try {
                        const { stdout } = await execPromise(cmd);
                        if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
                    } catch (error: any) {
                        console.error(`[Row ${index}] Step ${stepIndex} Deferred command failed:`, error.message);
                    }
                }

            } catch (e) {
                console.error(`[Row ${index}] Step ${stepIndex} Failed to copy winner file to final output:`, e);
            }
        }

        return {
            historyMessage: winner.historyMessage,
            columnValue: winner.columnValue
        };
    }

    private async judgeCandidates(
        candidates: (GenerationResult & { candidateIndex: number })[],
        config: ResolvedStepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        index: number,
        stepIndex: number
    ): Promise<GenerationResult & { candidateIndex: number }> {
        
        let judgeSystemPrompt = "You are an impartial judge evaluating AI responses. You must select the best response based on the user's original request.";
        
        // Add the custom judge prompt parts (rendered) to system prompt
        if (config.judgePromptParts && config.judgePromptParts.length > 0) {
            const judgeInstructions = config.judgePromptParts
                .filter(p => p.type === 'text')
                .map(p => p.text)
                .join('\n');
            
            if (judgeInstructions.trim()) {
                judgeSystemPrompt += "\n\n" + judgeInstructions;
            }
        } else {
            // Default prompt if none provided
            judgeSystemPrompt += "\n\nAnalyze the candidates above and select the best one based on the original request.";
        }

        const userPromptText = userPromptParts
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join('\n');

        const judgeMessageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `Original User Request:\n${userPromptText}\n\nCandidates:\n` }
        ];

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            judgeMessageContent.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });
            
            // Check if candidate content is image URL or text
            const val = cand.columnValue;
            if (val && (val.startsWith('http') || val.startsWith('data:image'))) {
                judgeMessageContent.push({ 
                    type: 'image_url', 
                    image_url: { url: val } 
                });
            } else {
                judgeMessageContent.push({ type: 'text', text: val || "(No Content)" });
            }
        }

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: judgeSystemPrompt },
            { role: 'user', content: judgeMessageContent }
        ];

        const JudgeSchema = z.object({
            best_candidate_index: z.number().int().min(0).max(candidates.length - 1).describe("The index of the best candidate (0-based)"),
            reason: z.string().describe("The reason for selecting this candidate")
        });

        const result = await this.llm.promptZod(messages, JudgeSchema, {
            model: config.judgeModel!
        });

        console.log(`[Row ${index}] Step ${stepIndex} Judge Reason: ${result.reason}`);

        return candidates[result.best_candidate_index];
    }
}
