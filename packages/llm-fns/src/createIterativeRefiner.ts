import OpenAI from 'openai';
import { completionToMessage } from './completionToUserMessage.js';

export interface EvaluationResult {
    success: boolean;
    feedback?: string;
}

export interface CreateIterativeRefinerParams<TInput, TGenerated> {
    /**
     * Function to generate the artifact.
     * Receives the input and the history of previous attempts (as chat messages).
     * Must return a ChatCompletion, a string, or an object convertible to a string.
     */
    generate: (input: TInput, history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => Promise<TGenerated>;

    /**
     * Function to evaluate the output.
     * Returns success status and optional feedback.
     */
    evaluate: (input: TInput, generated: TGenerated) => Promise<EvaluationResult>;

    /**
     * Maximum number of retries. Defaults to 3.
     */
    maxRetries?: number;

    /**
     * Converts the generated artifact into a chat message for history.
     * Defaults to using completionToMessage for ChatCompletion objects,
     * wrapping strings directly, or JSON stringifying other objects.
     */
    generatedToMessage?: (generated: TGenerated) => OpenAI.Chat.Completions.ChatCompletionMessageParam;
}

export function createIterativeRefiner<TInput, TGenerated>(
    params: CreateIterativeRefinerParams<TInput, TGenerated>
) {
    const {
        generate,
        evaluate,
        maxRetries = 3,
        generatedToMessage = (g: any) => {
            if (typeof g === 'string') {
                return { role: 'assistant', content: g };
            }
            if (g && typeof g === 'object' && 'choices' in g && Array.isArray(g.choices)) {
                return completionToMessage(g);
            }
            return { role: 'assistant', content: JSON.stringify(g) };
        }
    } = params;

    async function run(input: TInput): Promise<{
        generated: TGenerated;
        iterations: number;
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
        evaluations: EvaluationResult[];
        success: boolean;
        feedback?: string;
    }> {
        const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        const evaluations: EvaluationResult[] = [];
        let currentGenerated: TGenerated | undefined;
        let lastEvaluation: EvaluationResult = { feedback: 'No evaluation yet', success: false };

        for (let i = 0; i < maxRetries; i++) {
            // 1. Generate
            currentGenerated = await generate(input, history);

            // 2. Evaluate
            const evaluation = await evaluate(input, currentGenerated);
            evaluations.push(evaluation);
            lastEvaluation = evaluation;

            if (evaluation.success) {
                return {
                    generated: currentGenerated,
                    iterations: i + 1,
                    history,
                    evaluations,
                    ...evaluation,
                };
            }

            history.push(generatedToMessage(currentGenerated));
            if (evaluation.feedback) {
                history.push({ role: 'user', content: evaluation.feedback });
            }
        }

        if (!currentGenerated) {
            throw new Error("Failed to generate any valid result after all retries.");
        }

        console.warn(`[IterativeRefiner] Max retries reached. Returning last result.`);
        return {
            generated: currentGenerated,
            iterations: maxRetries,
            history,
            evaluations,
            ...lastEvaluation
        };
    }

    return { run };
}

export type CreateIterativeRefiner = ReturnType<typeof createIterativeRefiner>;
