import { describe, expect, it, vi } from 'vitest';
import OpenAI, { toFile } from 'openai';
import { createCachedFetcher, type CacheLike } from './createCachedFetcher.js';

function createMemoryCache() {
    const values = new Map<string, unknown>();
    const cache: CacheLike = {
        get: async key => values.get(key) as never,
        set: async (key, value) => { values.set(key, value); },
    };
    return { cache, values };
}

describe('createCachedFetcher', () => {
    it('caches equivalent multipart requests and distinguishes file contents', async () => {
        const { cache } = createMemoryCache();
        const transport = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
            const data = init?.body as FormData;
            return Response.json({ file: await (data.get('file') as Blob).text() });
        });
        const cachedFetch = createCachedFetcher({ cache, fetch: transport });
        const request = (contents: string) => {
            const data = new FormData();
            data.append('model', 'scribe');
            data.append('file', new Blob([contents], { type: 'audio/flac' }), 'sample.flac');
            return cachedFetch('https://speech.example/transcriptions', { method: 'POST', body: data });
        };

        expect(await (await request('first audio')).json()).toEqual({ file: 'first audio' });
        expect(await (await request('first audio')).json()).toEqual({ file: 'first audio' });
        expect(await (await request('different audio')).json()).toEqual({ file: 'different audio' });
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('fingerprints bodies supplied by Request objects without consuming them', async () => {
        const { cache } = createMemoryCache();
        const transport = vi.fn(async (input: string | URL | Request) => Response.json({ body: await (input as Request).text() }));
        const cachedFetch = createCachedFetcher({ cache, fetch: transport });
        const makeRequest = (body: string) => new Request('https://example.test/items', {
            method: 'PUT', body, headers: { authorization: 'Bearer secret' },
        });

        expect(await (await cachedFetch(makeRequest('one'))).json()).toEqual({ body: 'one' });
        expect(await (await cachedFetch(makeRequest('one'))).json()).toEqual({ body: 'one' });
        expect(await (await cachedFetch(makeRequest('two'))).json()).toEqual({ body: 'two' });
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('keeps credentials opaque while separating requests with different headers', async () => {
        const { cache, values } = createMemoryCache();
        const transport = vi.fn(async () => Response.json({ ok: true }));
        const cachedFetch = createCachedFetcher({ cache, prefix: 'test', fetch: transport });

        await cachedFetch('https://example.test', { headers: { authorization: 'Bearer first-secret' } });
        await cachedFetch('https://example.test', { headers: { authorization: 'Bearer second-secret' } });

        expect(transport).toHaveBeenCalledTimes(2);
        expect([...values.keys()].join('\n')).not.toContain('secret');
    });

    it('preserves a streaming request body after hashing it', async () => {
        const { cache } = createMemoryCache();
        const transport = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
            Response.json({ body: await new Response(init?.body).text() }));
        const cachedFetch = createCachedFetcher({ cache, fetch: transport });
        const stream = new Blob(['stream contents']).stream();

        expect(await (await cachedFetch('https://example.test/upload', {
            method: 'POST', body: stream, duplex: 'half',
        } as RequestInit)).json()).toEqual({ body: 'stream contents' });
    });

    it('caches multipart uploads produced by the OpenAI SDK', async () => {
        const { cache } = createMemoryCache();
        const transport = vi.fn(async (input: string | URL | Request) => {
            if (input.toString() === 'data:,') return new Response();
            return Response.json({ words: [] });
        });
        const client = new OpenAI({
            apiKey: 'test-key',
            fetch: createCachedFetcher({ cache, fetch: transport }),
        });
        const transcribe = async (contents: string) => client.audio.transcriptions.create({
            file: await toFile(Buffer.from(contents), 'sample.flac'),
            model: 'whisper-1',
            response_format: 'verbose_json',
        });

        await transcribe('same audio');
        await transcribe('same audio');
        await transcribe('different audio');

        const apiCalls = transport.mock.calls.filter(([input]) => input.toString().startsWith('https://'));
        expect(apiCalls).toHaveLength(2);
    });
});
