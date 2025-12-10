//
import OpenAI from 'openai';
import path from 'path';
import Handlebars from 'handlebars';
import util from 'util';
import { exec } from 'child_process';
import { z } from 'zod';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { StepConfig, StepContext } from '../types.js';
import { aggressiveSanitize, ensureDir } from '../utils/fileUtils.js';

const execPromise = util.promisify(exec);

export class CandidateStrategy implements GenerationStrategy {
    constructor(
        private standardStrategy: StandardStrategy,
        private stepContext: StepContext
    ) {}

    async execute(
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        config: StepConfig,
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
            // Determine a unique output path for this candidate
            let candidateOutputPath: string | null = null;

            // Use resolvedTempDir if available (structured), otherwise fallback to global tmpDir
            const baseTempDir = config.resolvedTempDir || config.tmpDir;
            const candidatesDir = path.join(baseTempDir, 'candidates');
            await ensureDir(candidatesDir);

            const name = config.outputBasename || 'output';
            const ext = config.outputExtension || (config.aspectRatio ? '.png' : '.txt');
            candidateOutputPath = path.join(candidatesDir, `${name}_cand_${i}${ext}`);

            const salt = `${cacheSalt || ''}_cand_${i}`;
            const shouldSkipCommands = config.noCandidateCommand || skipCommands;

            promises.push(
                this.standardStrategy.execute(
                    row, index, stepIndex, config, userPromptParts, history, salt, candidateOutputPath || undefined, shouldSkipCommands
                )
                .then(res => ({ ...res, candidateIndex: i, outputPath: candidateOutputPath }))
                .catch(err => {
                    console.error(`[Row ${index}] Step ${stepIndex} Candidate ${i} failed:`, err.message);
                    throw err;
                })
            );
        }

        const results = await Promise.allSettled(promises);
        const successfulCandidates = results
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<GenerationResult & { candidateIndex: number, outputPath: string | null }>).value);

        if (successfulCandidates.length === 0) {
            throw new Error(`All ${candidateCount} candidates failed to generate.`);
        }

        let winner: GenerationResult & { candidateIndex: number, outputPath: string | null };

        if (successfulCandidates.length === 1) {
            winner = successfulCandidates[0];
            if (candidateCount > 1) {
                console.log(`[Row ${index}] Step ${stepIndex} Only 1 candidate succeeded. Skipping judge.`);
            }
        } else {
            // We have > 1 candidates.
            if (this.stepContext.judge) {
                console.log(`[Row ${index}] Step ${stepIndex} Judging ${successfulCandidates.length} candidates...`);
                try {
                    winner = await this.judgeCandidates(successfulCandidates, config, userPromptParts, history, index, stepIndex);
                    console.log(`[Row ${index}] Step ${stepIndex} Judge selected candidate #${winner.candidateIndex + 1}`);
                } catch (e: any) {
                    console.error(`[Row ${index}] Step ${stepIndex} Judging failed: ${e.message}`);
                    throw e;
                }
            } else {
                // No judge configured. Warn and pick the first one.
                console.warn(`[Row ${index}] Step ${stepIndex} ⚠️  Multiple candidates generated but no judge configured. Defaulting to Candidate #1.`);
                winner = successfulCandidates[0];
            }
        }

        // Copy winner to final output
        if (config.outputPath && winner.outputPath) {
            const fs = await import('fs/promises');
            try {
                await ensureDir(config.outputPath);
                if (winner.outputPath !== config.outputPath) {
                    await fs.copyFile(winner.outputPath, config.outputPath);
                }

                // Run deferred commands
                if (config.noCandidateCommand && config.postProcessCommand) {
                    const cmdTemplate = Handlebars.compile(config.postProcessCommand, { noEscape: true });
                    const sanitizedRow: Record<string, string> = {};
                    for (const [key, val] of Object.entries(row)) {
                        const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
                        sanitizedRow[key] = aggressiveSanitize(stringVal);
                    }
                    const cmd = cmdTemplate({ ...sanitizedRow, file: config.outputPath });
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
            columnValue: winner.columnValue,
            raw: winner.raw
        };
    }

    private async judgeCandidates(
        candidates: (GenerationResult & { candidateIndex: number, outputPath: string | null })[],
        config: StepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        index: number,
        stepIndex: number
    ): Promise<GenerationResult & { candidateIndex: number, outputPath: string | null }> {

        if (!this.stepContext.judge) throw new Error("No judge configuration found");

        // Prepare Candidate Presentation
        const candidatePresentationParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: "\n\n--- CANDIDATE EVALUATION ---\nPlease evaluate the following candidates generated in response to the request above:\n" }
        ];

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            candidatePresentationParts.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });
            const val = cand.columnValue;
            if (val && (val.startsWith('http') || val.startsWith('data:image'))) {
                candidatePresentationParts.push({ type: 'image_url', image_url: { url: val } });
            } else {
                candidatePresentationParts.push({ type: 'text', text: val || "(No Content)" });
            }
        }

        // Inject Context (History + Original User Request)
        // Filter out original system prompt
        const contextMessages = history.filter(m => m.role !== 'system');
        // Add original user request
        contextMessages.push({ role: 'user', content: userPromptParts });

        const JudgeSchema = z.object({
            best_candidate_index: z.number().int().min(0).max(candidates.length - 1).describe("The index of the best candidate (0-based)"),
            reason: z.string().describe("The reason for selecting this candidate"),
        });

        // Use the pre-configured judge client
        const result = await this.stepContext.judge.promptZod(
            row,
            JudgeSchema,
            contextMessages,
            candidatePresentationParts
        );

        console.log(`[Row ${index}] Step ${stepIndex} Judge Reason: ${result.reason}`);

        return candidates[result.best_candidate_index];
    }
}
