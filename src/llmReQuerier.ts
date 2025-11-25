import OpenAI from 'openai';
import { AskGptFunction, GptAskOptions } from "./createCachedGptAsk.js";

// Custom error for the querier to handle, allowing retries with structured feedback.
export class LlmQuerierError extends Error {
    constructor(
        public readonly message: string,
        public readonly type: 'JSON_PARSE_ERROR' | 'CUSTOM_ERROR',
        public readonly details?: any,
        public readonly rawResponse?: string | null,
    ) {
        super(message);
        this.name = 'LlmQuerierError';
    }
}

export class LlmRequeryExhaustedError extends Error {
    constructor(
        public readonly message: string,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'LlmRequeryExhaustedError';
    }
}

// This error is thrown by LlmReQuerier for each failed attempt.
// It wraps the underlying error (from API call or validation) and adds context.
export class LlmAttemptError extends Error {
    constructor(
        public readonly message: string,
        public readonly mode: 'main' | 'fallback',
        public readonly conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        public readonly attemptNumber: number,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'LlmAttemptError';
    }
}

export type LlmReQuerierOptions = Omit<GptAskOptions, 'messages'> & {
    maxRetries?: number;
};

export interface LlmResponseInfo {
    mode: 'main' | 'fallback';
    conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    attemptNumber: number;
}

export class LlmReQuerier {
    protected fallbackAsk?: AskGptFunction;

    constructor(
        protected ask: AskGptFunction,
        options: { fallbackAsk?: AskGptFunction } = {}
    ) {
        this.fallbackAsk = options.fallbackAsk;
    }

    private _constructLlmMessages(
        baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        attemptNumber: number,
        previousError?: LlmAttemptError
    ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        if (attemptNumber === 0) {
            // First attempt
            return baseMessages;
        }

        if (!previousError) {
            // Should not happen for attempt > 0, but as a safeguard...
            throw new Error("Invariant violation: previousError is missing for a retry attempt.");
        }
        const cause = previousError.