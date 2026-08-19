import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type TrainingDataMessage = {
    role: string;
    content?: unknown;
    [key: string]: unknown;
};

/** An OpenAI chat-format row suitable for writing as one JSONL record. */
export type TrainingDataRecord = {
    id: string;
    messages: TrainingDataMessage[];
    metadata: Record<string, unknown>;
};

export type TrainingDataLogContext = {
    request: Record<string, unknown>;
    response: Record<string, unknown>;
    url: string;
};

export type TrainingDataLogger = (
    record: TrainingDataRecord,
    context: TrainingDataLogContext,
) => void | Promise<void>;

export type TrainingDataMetadata = Record<string, unknown> | (
    (context: TrainingDataLogContext) => Record<string, unknown> | Promise<Record<string, unknown>>
);

export interface CreateTrainingDataLoggingFetcherOptions {
    /** Receives one OpenAI-format training row for each returned completion choice. */
    logger: TrainingDataLogger;
    /** Fetch implementation to wrap. Defaults to global fetch. */
    fetch?: typeof globalThis.fetch;
    /** Static or request-aware metadata merged into every row. */
    metadata?: TrainingDataMetadata;
    /** Logging failures are non-fatal. This hook observes them; the default prints a warning. */
    onError?: (error: unknown) => void;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requestUrl(input: string | URL | Request): string {
    return input instanceof Request ? input.url : input.toString();
}

async function parseRequestBody(
    input: string | URL | Request,
    init?: RequestInit,
): Promise<Record<string, unknown> | null> {
    try {
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        if (method.toUpperCase() !== 'POST') return null;
        let body: unknown;
        if (init?.body !== undefined && init.body !== null) {
            if (typeof init.body === 'string') {
                body = JSON.parse(init.body) as unknown;
            } else if (init.body instanceof Blob) {
                body = JSON.parse(await init.body.text()) as unknown;
            } else if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) {
                const bytes = init.body instanceof ArrayBuffer
                    ? new Uint8Array(init.body)
                    : new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength);
                body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
            } else {
                return null;
            }
        } else if (input instanceof Request) {
            body = await input.clone().json() as unknown;
        } else {
            return null;
        }
        return isObject(body) ? body : null;
    } catch {
        return null;
    }
}

function isChatCompletionRequest(url: string, request: Record<string, unknown> | null): request is Record<string, unknown> & {
    messages: TrainingDataMessage[];
} {
    return /\/chat\/completions(?:\?|$)/u.test(url)
        && Array.isArray(request?.messages)
        && request.messages.every(isObject);
}

function completionChoices(response: Record<string, unknown>): TrainingDataMessage[] {
    if (!Array.isArray(response.choices)) return [];
    return response.choices.flatMap(choice => {
        if (!isObject(choice) || !isObject(choice.message)) return [];
        return [choice.message as TrainingDataMessage];
    });
}

function reportLoggingError(
    error: unknown,
    onError: CreateTrainingDataLoggingFetcherOptions['onError'],
): void {
    if (onError) {
        try {
            onError(error);
        } catch {
            // Observability must not change the result of the intercepted request.
        }
        return;
    }
    console.warn('[Training Data Logger] Could not record completion.', error);
}

/**
 * Wraps a fetch implementation and records successful, non-streaming OpenAI Chat Completions.
 * The returned response remains untouched and can be consumed normally by the caller.
 */
export function createTrainingDataLoggingFetcher(
    options: CreateTrainingDataLoggingFetcherOptions,
): typeof globalThis.fetch {
    const fetchImpl = options.fetch ?? globalThis.fetch;

    return async (input, init) => {
        const url = requestUrl(input);
        const requestPromise = parseRequestBody(input, init);
        const response = await fetchImpl(input, init);
        const request = await requestPromise;

        if (!response.ok || !isChatCompletionRequest(url, request) || request.stream === true) {
            return response;
        }

        try {
            const parsedResponse = await response.clone().json() as unknown;
            if (!isObject(parsedResponse) || 'error' in parsedResponse) return response;
            const messages = completionChoices(parsedResponse);
            if (messages.length === 0) return response;

            const context: TrainingDataLogContext = {
                request,
                response: parsedResponse,
                url,
            };
            const customMetadata = typeof options.metadata === 'function'
                ? await options.metadata(context)
                : options.metadata ?? {};
            const responseId = typeof parsedResponse.id === 'string'
                ? parsedResponse.id
                : randomUUID();
            const model = typeof parsedResponse.model === 'string'
                ? parsedResponse.model
                : typeof request.model === 'string'
                    ? request.model
                    : undefined;

            for (const [choiceIndex, assistantMessage] of messages.entries()) {
                await options.logger({
                    id: messages.length === 1 ? responseId : `${responseId}:${choiceIndex}`,
                    messages: [...request.messages, assistantMessage],
                    metadata: {
                        ...(model ? { model } : {}),
                        ...customMetadata,
                    },
                }, context);
            }
        } catch (error) {
            reportLoggingError(error, options.onError);
        }

        return response;
    };
}

/** Creates a concurrency-safe logger that appends one compact JSON object per line. */
export function createJsonlTrainingDataLogger(filePath: string): TrainingDataLogger {
    const resolvedPath = path.resolve(filePath);
    let pending = Promise.resolve();
    let directoryReady: Promise<void> | undefined;

    return record => {
        directoryReady ??= fs.mkdir(path.dirname(resolvedPath), { recursive: true })
            .then(() => undefined);
        const write = pending
            .then(() => directoryReady)
            .then(() => fs.appendFile(resolvedPath, `${JSON.stringify(record)}\n`, 'utf8'));
        pending = write.catch(() => undefined);
        return write;
    };
}
