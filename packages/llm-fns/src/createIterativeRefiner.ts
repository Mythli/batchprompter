import OpenAI from 'openai';
import { completionToMessage } from './completionToUserMessage.js';

export interface EvaluationResult {
    success: boolean;
    feedback?: string;
}

export interface CreateIterativeRefinerParams<TInput, TGenerated, TOutput> {
    /**
     * Function to generate the artifact.
     * Receives the input and the history of previous attempts (as chat messages).
     * Must return a ChatCompletion, a string, or an object convertible to a string.
     */
    generate: (input: TInput, history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => Promise<TGenerated>;

    /**
     * Function to execute the generated artifact.
     * Receives the generated artifact and the original input.
     */
    execute: (generated: TGenerated, input: TInput) => Promise<TOutput>;

    /**
     * Function to evaluate the output.
     * Returns success status and optional feedback.
     */
    evaluate: (input: TInput, generated: TGenerated, output: TOutput) => Promise<EvaluationResult>;

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

export function createIterativeRefiner<TInput, TGenerated, TOutput>(
    params: CreateIterativeRefinerParams<TInput, TGenerated, TOutput>
) {
    const {
        generate,
        execute,
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
        output?: TOutput;
        iterations: number;
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    }> {
        const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        let currentGenerated: TGenerated | undefined;
        let lastOutput: TOutput | undefined;

        for (let i = 0; i < maxRetries; i++) {
            // 1. Generate
            currentGenerated = await generate(input, history);

            // 2. Execute
            lastOutput = await execute(currentGenerated, input);

            // 3. Evaluate
            const evaluation = await evaluate(input, currentGenerated, lastOutput);

            if (evaluation.success) {
                return { generated: currentGenerated, output: lastOutput, iterations: i + 1, history };
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
        return { generated: currentGenerated, output: lastOutput, iterations: maxRetries, history };
    }

    return { run };
}

export type CreateIterativeRefiner = ReturnType<typeof createIterativeRefiner>;
