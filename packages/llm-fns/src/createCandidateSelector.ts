export interface SelectionResult {
    bestCandidateIndex: number;
    reason: string;
}

export interface CandidateResult<TCandidate> {
    candidate: TCandidate;
    originalIndex: number; // To track which generation attempt this was
}

export interface CreateCandidateSelectorParams<TInput, TCandidate> {
    /**
     * Number of candidates to generate.
     */
    candidateCount: number;

    /**
     * Function to generate a single candidate.
     * @param input The input data.
     * @param index The index of the candidate being generated (0 to candidateCount-1).
     */
    generate: (input: TInput, index: number) => Promise<TCandidate>;

    /**
     * Function to select the best candidate.
     * @param input The original input data.
     * @param candidates The list of successfully generated candidates.
     */
    judge: (input: TInput, candidates: TCandidate[]) => Promise<SelectionResult>;

    /**
     * Optional callback for when a candidate generation fails.
     */
    onCandidateError?: (error: any, index: number) => void;
}

export function createCandidateSelector<TInput, TCandidate>(
    params: CreateCandidateSelectorParams<TInput, TCandidate>
) {
    const { candidateCount, generate, judge, onCandidateError } = params;

    async function run(input: TInput) {
        // 1. Generate Candidates in Parallel
        const promises: Promise<CandidateResult<TCandidate> | null>[] = [];

        for (let i = 0; i < candidateCount; i++) {
            promises.push(
                generate(input, i)
                    .then(candidate => ({ candidate, originalIndex: i }))
                    .catch(err => {
                        if (onCandidateError) {
                            onCandidateError(err, i);
                        }
                        return null;
                    })
            );
        }

        const results = await Promise.all(promises);
        const successfulCandidates = results.filter((r): r is CandidateResult<TCandidate> => r !== null);

        // 2. Handle Failure Scenarios
        if (successfulCandidates.length === 0) {
            throw new Error(`All ${candidateCount} candidates failed to generate.`);
        }

        // 3. Short-circuit if only one candidate succeeded
        if (successfulCandidates.length === 1) {
            return {
                winner: successfulCandidates[0].candidate,
                winnerIndex: successfulCandidates[0].originalIndex,
                candidates: successfulCandidates.map(c => c.candidate),
                reason: "Only one candidate succeeded; skipping judge.",
                skippedJudge: true
            };
        }

        // 4. Judge
        // We pass only the candidate objects to the judge, stripping metadata
        const candidatesForJudge = successfulCandidates.map(c => c.candidate);
        
        const selection = await judge(input, candidatesForJudge);

        // Validate judge output
        if (selection.bestCandidateIndex < 0 || selection.bestCandidateIndex >= successfulCandidates.length) {
            throw new Error(`Judge returned invalid index ${selection.bestCandidateIndex}. Must be between 0 and ${successfulCandidates.length - 1}.`);
        }

        const winnerResult = successfulCandidates[selection.bestCandidateIndex];

        return {
            winner: winnerResult.candidate,
            winnerIndex: winnerResult.originalIndex,
            candidates: candidatesForJudge,
            reason: selection.reason,
            skippedJudge: false
        };
    }

    return { run };
}

export type CandidateSelector = ReturnType<typeof createCandidateSelector>;
