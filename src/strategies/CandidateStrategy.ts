import OpenAI from 'openai';
import { z } from 'zod';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { StepConfig, StepContext } from '../types.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';

export class CandidateStrategy implements GenerationStrategy {
    constructor(
        private standardStrategy: StandardStrategy,
        private stepContext: StepContext,
        private events: EventEmitter<BatchPromptEvents>
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

        this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} Generating ${candidateCount} candidates...` });

        const promises: Promise<GenerationResult & { candidateIndex: number }>[] = [];

        for (let i = 0; i < candidateCount; i++) {
            // Salt must include variation index to avoid cache collisions between exploded items
            const salt = `${cacheSalt || ''}_var_${variationIndex ?? 'x'}_cand_${i}`;
            
            // We pass a dummy output path override to StandardStrategy to trigger artifact emission with correct naming?
            // Actually StandardStrategy emits artifact based on config.outputBasename.
            // We need to ensure candidates don't overwrite each other in the artifact stream if they have same filename.
            // But StandardStrategy doesn't know about candidate index.
            // We might need to modify StandardStrategy to accept a filename suffix or handle it here.
            // For now, let's assume StandardStrategy emits 'final' tag.
            // We might want to intercept artifacts? No, StandardStrategy emits them.
            // If we run in parallel, we get multiple artifacts.
            // The consumer needs to handle them.
            
            // Ideally, we should probably NOT use StandardStrategy's artifact emission for candidates,
            // or we should tag them as 'candidate'.
            // But StandardStrategy is hardcoded to emit 'final'.
            // Refactor idea: Pass tags to StandardStrategy?
            
            // For this refactor, let's just run them. The artifacts will be emitted.
            // The filename in StandardStrategy uses variationIndex.
            // We should probably pass a variationIndex that includes candidate index?
            // Or just rely on the fact that we are returning the results and the Judge will pick one.
            
            promises.push(
                this.standardStrategy.execute(
                    row, index, stepIndex, config, userPromptParts, history, salt, undefined, skipCommands, variationIndex
                )
                .then(res => ({ ...res, candidateIndex: i }))
                .catch(err => {
                    this.events.emit('log', { level: 'error', message: `[Row ${index}] Step ${stepIndex} Candidate ${i} failed: ${err.message}` });
                    throw err;
                })
            );
        }

        const results = await Promise.allSettled(promises);
        const successfulCandidates = results
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<GenerationResult & { candidateIndex: number }>).value);

        if (successfulCandidates.length === 0) {
            throw new Error(`All ${candidateCount} candidates failed to generate.`);
        }

        let winner: GenerationResult & { candidateIndex: number };

        if (successfulCandidates.length === 1) {
            winner = successfulCandidates[0];
            if (candidateCount > 1) {
                this.events.emit('log', { level: 'warn', message: `[Row ${index}] Step ${stepIndex} Only 1 candidate succeeded. Skipping judge.` });
            }
            
            return {
                historyMessage: winner.historyMessage,
                columnValue: winner.columnValue,
                raw: winner.raw
            };
        } else {
            if (this.stepContext.judge) {
                this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} Judging ${successfulCandidates.length} candidates...` });
                try {
                    winner = await this.judgeCandidates(successfulCandidates, config, userPromptParts, history, index, stepIndex, row);
                    this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} Judge selected candidate #${winner.candidateIndex + 1}` });
                } catch (e: any) {
                    this.events.emit('log', { level: 'error', message: `[Row ${index}] Step ${stepIndex} Judging failed: ${e.message}` });
                    throw e;
                }
                
                return {
                    historyMessage: winner.historyMessage,
                    columnValue: winner.columnValue,
                    raw: winner.raw
                };
            } else {
                // NO JUDGE: Return array for explode
                this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} No judge configured. Returning all ${successfulCandidates.length} candidates.` });
                
                // We map to the raw result format expected by ResultProcessor (array of items)
                const explodedResults = successfulCandidates.map(c => c.raw || c.columnValue);

                return {
                    historyMessage: {
                        role: 'assistant',
                        content: `[Generated ${explodedResults.length} candidates]`
                    },
                    columnValue: null,
                    raw: explodedResults
                };
            }
        }
    }

    private async judgeCandidates(
        candidates: (GenerationResult & { candidateIndex: number })[],
        config: StepConfig,
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        index: number,
        stepIndex: number,
        row: Record<string, any>
    ): Promise<GenerationResult & { candidateIndex: number }> {

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

        const result = await this.stepContext.judge.promptZod(
            {
                prefix: contextParts,
                suffix: candidatePresentationParts
            },
            JudgeSchema
        );

        this.events.emit('log', { level: 'info', message: `[Row ${index}] Step ${stepIndex} Judge Reason: ${result.reason}` });

        return candidates[result.best_candidate_index];
    }
}
