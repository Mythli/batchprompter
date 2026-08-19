import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCachedFetcher } from './createCachedFetcher.js';
import {
    createJsonlTrainingDataLogger,
    createTrainingDataLoggingFetcher,
    type TrainingDataRecord,
} from './createTrainingDataLoggingFetcher.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map(directory =>
        fs.rm(directory, { force: true, recursive: true })));
});

function chatRequest(body: Record<string, unknown>): Request {
    return new Request('https://openai.example/v1/chat/completions', {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
}

describe('createTrainingDataLoggingFetcher', () => {
    it('logs an upstream-compatible OpenAI chat row with metadata', async () => {
        const records: TrainingDataRecord[] = [];
        const transport = vi.fn(async () => Response.json({
            choices: [{ message: { role: 'assistant', content: 'Bonjour' } }],
            id: 'chatcmpl-translation-1',
            model: 'example-model-v2',
        }));
        const loggedFetch = createTrainingDataLoggingFetcher({
            fetch: transport,
            logger: record => { records.push(record); },
            metadata: context => ({
                operation: 'translation',
                requestedModel: context.request.model,
            }),
        });
        const request = chatRequest({
            messages: [
                { role: 'system', content: 'Translate to French.' },
                { role: 'user', content: 'Hello' },
            ],
            model: 'example-model',
        });

        const response = await loggedFetch(request);

        await expect(response.json()).resolves.toMatchObject({ id: 'chatcmpl-translation-1' });
        expect(records).toEqual([{
            id: 'chatcmpl-translation-1',
            messages: [
                { role: 'system', content: 'Translate to French.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Bonjour' },
            ],
            metadata: {
                model: 'example-model-v2',
                operation: 'translation',
                requestedModel: 'example-model',
            },
        }]);
    });

    it('can sit inside createCachedFetcher and logs only real provider completions', async () => {
        const records: TrainingDataRecord[] = [];
        const values = new Map<string, unknown>();
        const transport = vi.fn(async () => Response.json({
            choices: [{ message: { role: 'assistant', content: 'One segment' } }],
            id: 'chatcmpl-segment-1',
            model: 'segmenter',
        }));
        const loggedProvider = createTrainingDataLoggingFetcher({
            fetch: transport,
            logger: record => { records.push(record); },
            metadata: { operation: 'segmentation' },
        });
        const cachedFetch = createCachedFetcher({
            cache: {
                get: async key => values.get(key) as never,
                set: async (key, value) => { values.set(key, value); },
            },
            fetch: loggedProvider,
        });
        const body = {
            messages: [{ role: 'user', content: 'Segment this transcript.' }],
            model: 'segmenter',
        };

        await cachedFetch(chatRequest(body));
        await cachedFetch(chatRequest(body));

        expect(transport).toHaveBeenCalledTimes(1);
        expect(records).toHaveLength(1);
        expect(records[0]?.metadata.operation).toBe('segmentation');
    });

    it('can wrap createCachedFetcher and logs cache replays without another provider call', async () => {
        const records: TrainingDataRecord[] = [];
        const values = new Map<string, unknown>();
        const transport = vi.fn(async () => Response.json({
            choices: [{ message: { role: 'assistant', content: 'Cached answer' } }],
            id: 'chatcmpl-cached-1',
            model: 'cached-model',
        }));
        const cachedProvider = createCachedFetcher({
            cache: {
                get: async key => values.get(key) as never,
                set: async (key, value) => { values.set(key, value); },
            },
            fetch: transport,
        });
        const loggedFetch = createTrainingDataLoggingFetcher({
            fetch: cachedProvider,
            logger: record => { records.push(record); },
        });
        const body = {
            messages: [{ role: 'user', content: 'Reuse this completion.' }],
            model: 'cached-model',
        };

        await loggedFetch(chatRequest(body));
        await loggedFetch(chatRequest(body));

        expect(transport).toHaveBeenCalledTimes(1);
        expect(records).toHaveLength(2);
        expect(records[0]).toEqual(records[1]);
    });

    it('ignores unrelated, failed, malformed, and streaming requests', async () => {
        const logger = vi.fn();
        const transport = vi.fn(async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();
            return url.includes('failed')
                ? Response.json({ error: { message: 'nope' } }, { status: 500 })
                : Response.json({ choices: [{ message: { role: 'assistant', content: 'answer' } }] });
        });
        const loggedFetch = createTrainingDataLoggingFetcher({ fetch: transport, logger });

        await loggedFetch('https://openai.example/v1/models');
        await loggedFetch(chatRequest({ model: 'test', stream: true, messages: [] }));
        await loggedFetch(new Request('https://openai.example/v1/chat/completions/failed', {
            body: JSON.stringify({ model: 'test', messages: [] }),
            method: 'POST',
        }));
        await loggedFetch(new Request('https://openai.example/v1/chat/completions', {
            body: 'not json',
            method: 'POST',
        }));

        expect(logger).not.toHaveBeenCalled();
    });

    it('does not let logger failures alter the intercepted response', async () => {
        const observedErrors: unknown[] = [];
        const loggedFetch = createTrainingDataLoggingFetcher({
            fetch: async () => Response.json({
                choices: [{ message: { role: 'assistant', content: 'answer' } }],
                id: 'chatcmpl-1',
            }),
            logger: () => { throw new Error('disk full'); },
            onError: error => { observedErrors.push(error); },
        });

        const response = await loggedFetch(chatRequest({
            model: 'test',
            messages: [{ role: 'user', content: 'question' }],
        }));

        await expect(response.json()).resolves.toMatchObject({ id: 'chatcmpl-1' });
        expect(observedErrors).toHaveLength(1);
    });

    it('appends concurrent records as valid JSONL', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'training-data-logger-'));
        temporaryDirectories.push(directory);
        const outputPath = path.join(directory, 'nested', 'requests.jsonl');
        const logger = createJsonlTrainingDataLogger(outputPath);
        const record = (id: string): TrainingDataRecord => ({
            id,
            messages: [{ role: 'assistant', content: id }],
            metadata: {},
        });

        await Promise.all([
            logger(record('first'), { request: {}, response: {}, url: '' }),
            logger(record('second'), { request: {}, response: {}, url: '' }),
            logger(record('third'), { request: {}, response: {}, url: '' }),
        ]);

        const rows = (await fs.readFile(outputPath, 'utf8')).trim().split('\n')
            .map(line => JSON.parse(line) as TrainingDataRecord);
        expect(rows.map(row => row.id)).toEqual(['first', 'second', 'third']);
    });
});
