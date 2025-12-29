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
        skipCommands?: boolean,
        variationIndex?: number
    ): Promise<GenerationResult> {
        const candidateCount = config.candidates;

        console.log(`[Row ${index}] Step ${stepIndex} Generating ${candidateCount} candidates...`);

        const promises: Promise<GenerationResult & { candidateIndex: number, outputPath: string | null }>[] = [];

        for (let i = 0; i < candidateCount; i++) {
            let candidateOutputPath: string | null = null;

            const baseTempDir = config.resolvedTempDir || config.tmpDir;
            const candidatesDir = path.join(baseTempDir, 'candidates');
            await ensureDir(candidatesDir);

            const name = config.outputBasename || 'output';
            const ext = config.outputExtension || (config.aspectRatio ? '.png' : '.txt');
            
            // Filename logic: name + [variation] + candidate
            let filename = `${name}`;
            if (variationIndex !== undefined) {
                filename += `_${variationIndex}`;
            }
            filename += `_${i}${ext}`;

            candidateOutputPath = path.join(candidatesDir, filename);

            // Salt must include variation index to avoid cache collisions between exploded items
            const salt = `${cacheSalt || ''}_var_${variationIndex ?? 'x'}_cand_${i}`;
            const shouldSkipCommands = config.noCandidateCommand || skipCommands;

            promises.push(
                this.standardStrategy.execute(
                    row, index, stepIndex, config, userPromptParts, history, salt, candidateOutputPath || undefined, shouldSkipCommands, variationIndex
                )
                .then(res => ({ ...res, candidateIndex: i, outputPath: candidateOutputPath }))
                .catch(err => {
                    console.error(`[Row ${index}] Step ${stepIndex} Candidate ${i} failed:`, err);
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
            
            // Single candidate - standard behavior
            if (config.outputPath && winner.outputPath) {
                await this.copyWinnerToOutput(winner, config, row, index, stepIndex, variationIndex);
            }

            return {
                historyMessage: winner.historyMessage,
                columnValue: winner.columnValue,
                raw: winner.raw
            };
        } else {
            if (this.stepContext.judge) {
                console.log(`[Row ${index}] Step ${stepIndex} Judging ${successfulCandidates.length} candidates...`);
                try {
                    winner = await this.judgeCandidates(successfulCandidates, config, userPromptParts, history, index, stepIndex, row);
                    console.log(`[Row ${index}] Step ${stepIndex} Judge selected candidate #${winner.candidateIndex + 1}`);
                } catch (e: any) {
                    console.error(`[Row ${index}] Step ${stepIndex} Judging failed:`, e);
                    throw e;
                }
                
                // Judge selected a winner - standard behavior
                if (config.outputPath && winner.outputPath) {
                    await this.copyWinnerToOutput(winner, config, row, index, stepIndex, variationIndex);
                }

                return {
                    historyMessage: winner.historyMessage,
                    columnValue: winner.columnValue,
                    raw: winner.raw
                };
            } else {
                // NO JUDGE: Save all candidates and return array for explode
                console.log(`[Row ${index}] Step ${stepIndex} No judge configured. Saving all ${successfulCandidates.length} candidates (explode mode).`);
                
                const explodedResults = await this.saveAllCandidates(
                    successfulCandidates, 
                    config, 
                    row, 
                    index, 
                    stepIndex,
                    variationIndex
                );

                return {
                    historyMessage: {
                        role: 'assistant',
                        content: `[Generated ${explodedResults.length} candidates]`
                    },
                    columnValue: null,
                    raw: explodedResults  // Array triggers explode in ResultProcessor
                };
            }
        }
    }

    private async copyWinnerToOutput(
        winner: GenerationResult & { candidateIndex: number, outputPath: string | null },
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        variationIndex?: number
    ): Promise<void> {
        const fs = await import('fs/promises');
        try {
            // Determine final output path
            let finalPath = config.outputPath!;
            
            // If we have a variation index, we MUST inject it into the filename to prevent overwrites
            if (variationIndex !== undefined) {
                finalPath = this.injectVariationIndex(finalPath, variationIndex);
            }

            await ensureDir(finalPath);
            if (winner.outputPath !== finalPath) {
                await fs.copyFile(winner.outputPath!, finalPath);
            }

            if (config.noCandidateCommand && config.postProcessCommand) {
                await this.runDeferredCommand(config.postProcessCommand, row, finalPath, index, stepIndex);
            }
        } catch (e) {
            console.error(`[Row ${index}] Step ${stepIndex} Failed to copy winner file to final output:`, e);
        }
    }

    private async saveAllCandidates(
        candidates: (GenerationResult & { candidateIndex: number, outputPath: string | null })[],
        config: StepConfig,
        row: Record<string, any>,
        index: number,
        stepIndex: number,
        variationIndex?: number
    ): Promise<any[]> {
        const fs = await import('fs/promises');
        const results: any[] = [];

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            
            let finalOutputPath: string | null = null;

            if (config.outputPath && candidate.outputPath) {
                // Generate indexed path: "02_HeroImage.jpg" → "02_HeroImage_1.jpg"
                // If variation exists: "02_HeroImage_0.jpg" -> "02_HeroImage_0_1.jpg"
                
                let basePath = config.outputPath;
                if (variationIndex !== undefined) {
                    basePath = this.injectVariationIndex(basePath, variationIndex);
                }

                finalOutputPath = this.createIndexedPath(basePath, i);
                
                try {
                    await ensureDir(finalOutputPath);
                    await fs.copyFile(candidate.outputPath, finalOutputPath);
                    console.log(`[Row ${index}] Step ${stepIndex} Saved candidate ${i + 1} to ${finalOutputPath}`);

                    // Run deferred command if applicable
                    if (config.noCandidateCommand && config.postProcessCommand) {
                        await this.runDeferredCommand(config.postProcessCommand, row, finalOutputPath, index, stepIndex);
                    }
                } catch (e) {
                    console.error(`[Row ${index}] Step ${stepIndex} Failed to save candidate ${i + 1}:`, e);
                }
            }

            // Build result object for this candidate
            results.push({
                outputPath: finalOutputPath || candidate.outputPath,
                candidateIndex: candidate.candidateIndex,
                content: candidate.columnValue,
                raw: candidate.raw
            });
        }

        return results;
    }

    private injectVariationIndex(filePath: string, variationIndex: number): string {
        const parsed = path.parse(filePath);
        // e.g. "image.jpg" -> "image_0.jpg"
        return path.join(parsed.dir, `${parsed.name}_${variationIndex}${parsed.ext}`);
    }

    private createIndexedPath(basePath: string, index: number): string {
        const parsed = path.parse(basePath);
        // 1-based indexing for human-friendliness
        return path.join(parsed.dir, `${parsed.name}_${index + 1}${parsed.ext}`);
    }

    private async runDeferredCommand(
        commandTemplate: string,
        row: Record<string, any>,
        filePath: string,
        index: number,
        stepIndex: number
    ): Promise<void> {
        const cmdTemplate = Handlebars.compile(commandTemplate, { noEscape: true });
        const sanitizedRow: Record<string, string> = {};
        for (const [key, val] of Object.entries(row)) {
            const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
            sanitizedRow[key] = aggressiveSanitize(stringVal);
        }
        const cmd = cmdTemplate({ ...sanitizedRow, file: filePath });
        console.log(`[Row ${index}] Step ${stepIndex} ⚙️ Running deferred command: ${cmd}`);
        try {
            const { stdout } = await execPromise(cmd);
            if (stdout && stdout.trim()) console.log(`[Row ${index}] Step ${stepIndex} STDOUT:\n${stdout.trim()}`);
        } catch (error: any) {
            console.error(`[Row ${index}] Step ${stepIndex} Deferred command failed:`, error);
        }
    }

    private async judgeCandidates(
        candidates: (GenerationResult & { candidateIndex: number, outputPath: string | null })[],
        config: StepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        index: number,
        stepIndex: number,
        row: Record<string, any>
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

        // Add context about the original request
        const contextParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: "Original request:\n" },
            ...userPromptParts
        ];

        const JudgeSchema = z.object({
            best_candidate_index: z.number().int().min(0).max(candidates.length - 1).describe("The index of the best candidate (0-based)"),
            reason: z.string().describe("The reason for selecting this candidate"),
        });

        // Use the BoundLlmClient's promptZod with prefix (context) and suffix (candidates)
        const result = await this.stepContext.judge.promptZod(
            {
                prefix: contextParts,
                suffix: candidatePresentationParts
            },
            JudgeSchema
        );

        console.log(`[Row ${index}] Step ${stepIndex} Judge Reason: ${result.reason}`);

        return candidates[result.best_candidate_index];
    }
}
