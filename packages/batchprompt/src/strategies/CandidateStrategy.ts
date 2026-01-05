import OpenAI from 'openai';
import { z } from 'zod';
import { createCandidateSelector } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { StepConfig, StepContext } from '../types.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';

type CandidateType = GenerationResult & { candidateIndex: number };

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

        this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Generating ${candidateCount} candidates...` });

        const selector = createCandidateSelector<void, CandidateType>({
            candidateCount,
            generate: async (_, i, salt) => {
                const res = await this.standardStrategy.execute(
                    row, index, stepIndex, config, userPromptParts, history, salt, undefined, skipCommands, variationIndex
                );
                return { ...res, candidateIndex: i };
            },
            judge: async (_, candidates) => {
                if (!this.stepContext.judge) {
                    // No judge configured, return dummy selection (we will use all candidates anyway)
                    return { bestCandidateIndex: 0, reason: "No judge configured" };
                }

                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judging ${candidates.length} candidates...` });
                try {
                    const decision = await this.performJudging(candidates, userPromptParts);
                    return {
                        bestCandidateIndex: decision.best_candidate_index,
                        reason: decision.reason
                    };
                } catch (e: any) {
                    this.events.emit('step:progress', { row: index, step: stepIndex, type: 'error', message: `Judging failed: ${e.message}` });
                    throw e;
                }
            },
            onCandidateError: (err, i) => {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'error', message: `Candidate ${i} failed: ${err.message}` });
            }
        });

        const selection = await selector.run(undefined, cacheSalt);

        if (this.stepContext.judge) {
            if (!selection.skippedJudge) {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judge selected candidate #${selection.winner.candidateIndex + 1}` });
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judge Reason: ${selection.reason}` });
            } else if (candidateCount > 1) {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'warn', message: `Only 1 candidate succeeded. Skipping judge.` });
            }

            return {
                historyMessage: selection.winner.historyMessage,
                columnValue: selection.winner.columnValue,
                raw: selection.winner.raw
            };
        } else {
            // NO JUDGE: Return array for explode
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `No judge configured. Returning all ${selection.candidates.length} candidates.` });

            // We map to the raw result format expected by ResultProcessor (array of items)
            const explodedResults = selection.candidates.map(c => c.raw || c.columnValue);

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

    private async performJudging(
        candidates: CandidateType[],
        userPromptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): Promise<{ best_candidate_index: number; reason: string }> {

        if (!this.stepContext.judge) throw new Error("No judge configuration found");

        // Prepare Candidate Presentation
        const candidatePresentationParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: "\n\n--- CANDIDATE EVALUATION ---\nPlease evaluate the following candidates generated in response to the request above:\n" }
        ];

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            candidatePresentationParts.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });
            
            const content = cand.historyMessage.content;
            
            if (typeof content === 'string') {
                candidatePresentationParts.push({ type: 'text', text: content || "(No Content)" });
            } else if (Array.isArray(content)) {
                // Spread content parts directly (images, audio, text)
                candidatePresentationParts.push(...content);
            } else {
                candidatePresentationParts.push({ type: 'text', text: "(No Content)" });
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

        return await this.stepContext.judge.promptZod(
            {
                prefix: contextParts,
                suffix: candidatePresentationParts
            },
            JudgeSchema
        );
    }
}
