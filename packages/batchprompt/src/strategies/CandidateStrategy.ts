import OpenAI from 'openai';
import { z } from 'zod';
import { createCandidateSelector } from 'llm-fns';
import { GenerationStrategy } from './GenerationStrategy.js';
import { StandardStrategy } from './StandardStrategy.js';
import { StepRow } from '../StepRow.js';
import { PluginPacket } from '../plugins/types.js';

type CandidateType = {
    packet: PluginPacket;
    candidateIndex: number;
};

export class CandidateStrategy implements GenerationStrategy {
    constructor(
        private standardStrategy: StandardStrategy,
        private stepRow: StepRow
    ) {}

    private get events() {
        return this.stepRow.getEvents();
    }

    async execute(cacheSalt?: string | number): Promise<PluginPacket[]> {
        const config = this.stepRow.hydratedConfig;
        const index = (this.stepRow as any).state.originalIndex;
        const stepIndex = this.stepRow.step.stepIndex;
        const candidateCount = config.candidates;
        const judgeConfig = config.judge;

        this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Generating ${candidateCount} candidates...` });

        const selector = createCandidateSelector<void, CandidateType>({
            candidateCount,
            generate: async (_, i, salt) => {
                const packets = await this.standardStrategy.execute(salt);
                // Standard strategy returns 1 packet usually.
                return { packet: packets[0], candidateIndex: i };
            },
            judge: async (_, candidates) => {
                if (!judgeConfig) {
                    // No judge configured, return dummy selection
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

            return [selection.winner.packet];
        } else {
            // NO JUDGE: Return all candidates to explode
            this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `No judge configured. Returning all ${selection.candidates.length} candidates.` });

            // We merge all candidate data into a single array for the packet
            const allData = selection.candidates.flatMap(c => c.packet.data);
            
            return [{
                data: allData,
                contentParts: [],
                history: undefined
            }];
        }
    }

    private async performJudging(
        candidates: CandidateType[]
    ): Promise<{ best_candidate_index: number; reason: string }> {
        const judgeConfig = this.stepRow.hydratedConfig.judge;
        if (!judgeConfig) throw new Error("No judge configuration found");

        const judgeClient = this.stepRow.getBoundClient(judgeConfig);

        // Prepare Candidate Presentation
        const candidatePresentationParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: "\n\n--- CANDIDATE EVALUATION ---\nPlease evaluate the following candidates generated in response to the request above:\n" }
        ];

        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            candidatePresentationParts.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });

            const val = cand.packet.data[0]; // Assuming single item per candidate packet
            const valStr = typeof val === 'string' ? val : JSON.stringify(val);

            // Heuristic for images
            if (valStr.startsWith('http') || valStr.startsWith('data:image')) {
                candidatePresentationParts.push({
                    type: 'image_url',
                    image_url: { url: valStr }
                });
            } else {
                candidatePresentationParts.push({ type: 'text', text: valStr });
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
