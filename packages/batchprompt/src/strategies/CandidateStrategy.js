import { z } from 'zod';
export class CandidateStrategy {
    standardStrategy;
    stepContext;
    events;
    constructor(standardStrategy, stepContext, events) {
        this.standardStrategy = standardStrategy;
        this.stepContext = stepContext;
        this.events = events;
    }
    async execute(row, index, stepIndex, config, userPromptParts, history, cacheSalt, outputPathOverride, skipCommands, variationIndex) {
        const candidateCount = config.candidates;
        this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Generating ${candidateCount} candidates...` });
        const promises = [];
        for (let i = 0; i < candidateCount; i++) {
            // Salt must include variation index to avoid cache collisions between exploded items
            const salt = `${cacheSalt || ''}_var_${variationIndex ?? 'x'}_cand_${i}`;
            promises.push(this.standardStrategy.execute(row, index, stepIndex, config, userPromptParts, history, salt, undefined, skipCommands, variationIndex)
                .then(res => ({ ...res, candidateIndex: i }))
                .catch(err => {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'error', message: `Candidate ${i} failed: ${err.message}` });
                throw err;
            }));
        }
        const results = await Promise.allSettled(promises);
        const successfulCandidates = results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);
        if (successfulCandidates.length === 0) {
            throw new Error(`All ${candidateCount} candidates failed to generate.`);
        }
        let winner;
        if (successfulCandidates.length === 1) {
            winner = successfulCandidates[0];
            if (candidateCount > 1) {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'warn', message: `Only 1 candidate succeeded. Skipping judge.` });
            }
            return {
                historyMessage: winner.historyMessage,
                columnValue: winner.columnValue,
                raw: winner.raw
            };
        }
        else {
            if (this.stepContext.judge) {
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judging ${successfulCandidates.length} candidates...` });
                try {
                    winner = await this.judgeCandidates(successfulCandidates, config, userPromptParts, history, index, stepIndex, row);
                    this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judge selected candidate #${winner.candidateIndex + 1}` });
                }
                catch (e) {
                    this.events.emit('step:progress', { row: index, step: stepIndex, type: 'error', message: `Judging failed: ${e.message}` });
                    throw e;
                }
                return {
                    historyMessage: winner.historyMessage,
                    columnValue: winner.columnValue,
                    raw: winner.raw
                };
            }
            else {
                // NO JUDGE: Return array for explode
                this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `No judge configured. Returning all ${successfulCandidates.length} candidates.` });
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
    async judgeCandidates(candidates, config, userPromptParts, history, index, stepIndex, row) {
        if (!this.stepContext.judge)
            throw new Error("No judge configuration found");
        // Prepare Candidate Presentation
        const candidatePresentationParts = [
            { type: 'text', text: "\n\n--- CANDIDATE EVALUATION ---\nPlease evaluate the following candidates generated in response to the request above:\n" }
        ];
        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            candidatePresentationParts.push({ type: 'text', text: `\n--- Candidate ${i} ---\n` });
            const val = cand.columnValue;
            if (val && (val.startsWith('http') || val.startsWith('data:image'))) {
                candidatePresentationParts.push({ type: 'image_url', image_url: { url: val } });
            }
            else {
                candidatePresentationParts.push({ type: 'text', text: val || "(No Content)" });
            }
        }
        // Add context about the original request
        const contextParts = [
            { type: 'text', text: "Original request:\n" },
            ...userPromptParts
        ];
        const JudgeSchema = z.object({
            best_candidate_index: z.number().int().min(0).max(candidates.length - 1).describe("The index of the best candidate (0-based)"),
            reason: z.string().describe("The reason for selecting this candidate"),
        });
        const result = await this.stepContext.judge.promptZod({
            prefix: contextParts,
            suffix: candidatePresentationParts
        }, JudgeSchema);
        this.events.emit('step:progress', { row: index, step: stepIndex, type: 'info', message: `Judge Reason: ${result.reason}` });
        return candidates[result.best_candidate_index];
    }
}
//# sourceMappingURL=CandidateStrategy.js.map