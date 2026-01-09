import OpenAI from 'openai';
import { z } from 'zod';
import { createCandidateSelector } from 'llm-fns';
import { GenerationStrategy, GenerationResult } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { StepRow } from '../StepRow.js';

type CandidateType = GenerationResult & { candidateIndex: number };

export class CandidateStrategy implements GenerationStrategy {
    constructor(
        private standardStrategy: StandardStrategy,
        private stepRow: StepRow
    ) {}

    private get events() {
        return this.stepRow.getEvents();
    }

    async execute(cacheSalt?: string | number): Promise<GenerationResult> {
        const config = this.stepRow.step.config;
        const index = this.stepRow.item.originalIndex;
        const stepIndex = this.stepRow.step.stepIndex;
        const candidateCount = config.candidates;
        const judgeConfig = config.judge;

        this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Generating ${candidateCount} candidates...` });

        const selector = createCandidateSelector<void, CandidateType>({
            candidateCount,
            generate: async (_, i, salt) => {
                const res = await this.standardStrategy.execute(salt);
                return { ...res, candidateIndex: i };
            },
            judge: async (_, candidates) => {
                if (!judgeConfig) {
                    // No judge configured, return dummy selection (we will use all candidates anyway)
                    return { bestCandidateIndex: 0, reason: "No judge configured" };
                }

                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judging ${candidates.length} candidates...` });
                try {
                    const decision = await this.performJudging(candidates);
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

        if (judgeConfig) {
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
        candidates: CandidateType[]
    ): Promise<{ best_candidate_index: number; reason: string }> {
        const judgeConfig = this.stepRow.step.config.judge;
        if (!judgeConfig) throw new Error("No judge configuration found");

        const judgeClient = this.stepRow.getBoundClient(judgeConfig);

        // Prepare Candidate Presentation
        const candidatePresentationParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: "\n\n--- CANDIDATE EVALUATION ---\nPlease evaluate the following candidates generated in response to the request above:\n" }
        ];

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            candidatePresentationParts.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });

            const val = cand.columnValue || "";

            // Heuristic for images
            if (val.startsWith('http') || val.startsWith('data:image')) {
                candidatePresentationParts.push({
                    type: 'image_url',
                    image_url: { url: val }
                });
            } else {
                candidatePresentationParts.push({ type: 'text', text: val });
            }
        }

        // Add context about the original request
        const messages = this.stepRow.preparedMessages;
        const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user');
        const contextParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: "Original request context:\n" }
        ];

        if (lastUserMsg && Array.isArray(lastUserMsg.content)) {
            contextParts.push(...lastUserMsg.content);
        } else if (lastUserMsg && typeof lastUserMsg.content === 'string') {
            contextParts.push({ type: 'text', text: lastUserMsg.content });
        }

        const JudgeSchema = z.object({
            best_candidate_index: z.number().int().min(0).max(candidates.length - 1).describe("The index of the best candidate (0-based)"),
            reason: z.string().describe("The reason for selecting this candidate"),
        });

        return await judgeClient.promptZod(
            {
                prefix: contextParts,
                suffix: candidatePresentationParts
            },
            JudgeSchema
        );
    }
}
