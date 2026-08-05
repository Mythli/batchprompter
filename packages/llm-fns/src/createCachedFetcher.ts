import crypto from 'node:crypto';

export interface CacheLike {
    get<T>(key: string): Promise<T | undefined | null>;
    set(key: string, value: any, ttl?: number): Promise<any>;
}

export type FetcherOptions = RequestInit & {
    /** Optional TTL override for this specific request, in milliseconds. */
    ttl?: number;
};

export type Fetcher = (
    url: string | URL | Request,
    options?: FetcherOptions
) => Promise<Response>;

export interface CreateFetcherDependencies {
    /** Cache instance, for example a cache-manager Cache. */
    cache?: CacheLike;
    /** Prefix for all cache keys. Defaults to `http-cache`. */
    prefix?: string;
    /** Time-to-live in milliseconds. */
    ttl?: number;
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** User-Agent header to add to requests. */
    userAgent?: string;
    /** Fetch implementation. Defaults to global fetch. */
    fetch?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
    /** Return false to prevent a successful response from being cached. */
    shouldCache?: (response: Response) => Promise<boolean> | boolean;
}

interface CacheData {
    bodyBase64: string;
    headers: Record<string, string>;
    status: number;
    finalUrl: string;
}

export class CachedResponse extends Response {
    #finalUrl: string;

    constructor(body: BodyInit | null, init: ResponseInit, finalUrl: string) {
        super(body, init);
        this.#finalUrl = finalUrl;
    }

    get url() {
        return this.#finalUrl;
    }
}

function hashBytes(value: string | ArrayBuffer | ArrayBufferView): string {
    return crypto.createHash('sha256').update(
        typeof value === 'string' ? value : Buffer.from(value instanceof ArrayBuffer
            ? value
            : value.buffer, value instanceof ArrayBuffer ? undefined : value.byteOffset,
        value instanceof ArrayBuffer ? undefined : value.byteLength)
    ).digest('hex');
}

function normalizedHeaders(headers: Headers): [string, string][] {
    return [...headers.entries()]
        .map(([name, value]): [string, string] => {
            const normalizedName = name.toLowerCase();
            const normalizedValue = normalizedName === 'content-type' && /^multipart\/form-data\b/iu.test(value)
                ? 'multipart/form-data'
                : value.trim();
            return [normalizedName, normalizedValue];
        })
        // Content length and multipart boundaries are transport details, not request semantics.
        .filter(([name]) => name !== 'content-length')
        .sort(([left], [right]) => left.localeCompare(right));
}

async function hashFormData(formData: FormData): Promise<string> {
    const hash = crypto.createHash('sha256');
    for (const [name, value] of formData.entries()) {
        const nameBytes = Buffer.from(name);
        hash.update(`name:${nameBytes.byteLength}:`);
        hash.update(nameBytes);
        if (typeof value === 'string') {
            const valueBytes = Buffer.from(value);
            hash.update(`:text:${valueBytes.byteLength}:`);
            hash.update(valueBytes);
            continue;
        }

        const fileName = 'name' in value && typeof value.name === 'string' ? value.name : '';
        const metadata = Buffer.from(`${fileName}\0${value.type}`);
        const bytes = await value.arrayBuffer();
        hash.update(`:blob:${metadata.byteLength}:`);
        hash.update(metadata);
        hash.update(`:${bytes.byteLength}:`);
        hash.update(Buffer.from(bytes));
    }
    return hash.digest('hex');
}

async function hashBody(body: BodyInit): Promise<string> {
    if (body instanceof FormData) return `form-data:${await hashFormData(body)}`;
    if (body instanceof URLSearchParams) return `url-search-params:${hashBytes(body.toString())}`;
    if (typeof body === 'string') return `text:${hashBytes(body)}`;
    if (body instanceof Blob) return `blob:${body.type}:${hashBytes(await body.arrayBuffer())}`;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return `bytes:${hashBytes(body)}`;
    return `stream:${hashBytes(await new Response(body).arrayBuffer())}`;
}

async function hashRequestBody(request: Request): Promise<string> {
    if (!request.body) return 'none';
    const clone = request.clone();
    const contentType = clone.headers.get('content-type') ?? '';
    if (/^multipart\/form-data\b/iu.test(contentType)) {
        return `form-data:${await hashFormData(await clone.formData())}`;
    }
    return `bytes:${hashBytes(await clone.arrayBuffer())}`;
}

async function createRequestFingerprint(
    input: string | URL | Request,
    method: string,
    headers: Headers,
    body: BodyInit | null | undefined,
): Promise<string> {
    const bodyHash = body !== undefined && body !== null
        ? await hashBody(body)
        : input instanceof Request
            ? await hashRequestBody(input)
            : 'none';
    return hashBytes(JSON.stringify({
        version: 2,
        method: method.toUpperCase(),
        url: input instanceof Request ? input.url : input.toString(),
        headers: normalizedHeaders(headers),
        body: bodyHash,
    }));
}

/** Creates a fetch-compatible function backed by deterministic response caching. */
export function createCachedFetcher(deps: CreateFetcherDependencies): Fetcher {
    const { cache, prefix = 'http-cache', ttl, timeout, userAgent, fetch: customFetch, shouldCache } = deps;
    const fetchImpl = customFetch ?? fetch;

    return async (input: string | URL | Request, options?: FetcherOptions): Promise<Response> => {
        const { ttl: requestTtl, ...requestOptions } = options ?? {};
        const method = requestOptions.method ?? (input instanceof Request ? input.method : 'GET');
        const headers = new Headers(requestOptions.headers ?? (input instanceof Request ? input.headers : undefined));
        if (userAgent) headers.set('user-agent', userAgent);

        let body = requestOptions.body;
        // Tee streaming bodies so fingerprinting never consumes the copy sent over the network.
        if (body instanceof ReadableStream) {
            const [transportBody, fingerprintBody] = body.tee();
            body = fingerprintBody;
            requestOptions.body = transportBody;
        }
        const finalOptions: RequestInit = { ...requestOptions, headers };

        const urlString = input instanceof Request ? input.url : input.toString();
        if (!cache) return fetchWithTimeout(fetchImpl, input, finalOptions, timeout, urlString);

        const fingerprint = await createRequestFingerprint(input, method, headers, body);
        const cacheKey = `${prefix}:v2:${fingerprint}`;
        const cachedItem = await cache.get<CacheData>(cacheKey);
        if (cachedItem) {
            return new CachedResponse(Buffer.from(cachedItem.bodyBase64, 'base64'), {
                status: cachedItem.status,
                headers: cachedItem.headers,
            }, cachedItem.finalUrl);
        }

        const response = await fetchWithTimeout(fetchImpl, input, finalOptions, timeout, urlString);
        if (!response.ok) return response;

        let isCacheable = true;
        if (shouldCache) {
            try {
                isCacheable = await shouldCache(response.clone());
            } catch (error) {
                console.warn('[Cache Check Error] shouldCache threw an error, skipping cache', error);
                isCacheable = false;
            }
        } else if (response.headers.get('content-type')?.includes('application/json')) {
            try {
                const responseBody = await response.clone().json();
                if (responseBody && typeof responseBody === 'object' && 'error' in responseBody) isCacheable = false;
            } catch {
                // A malformed JSON content type does not make an otherwise successful response uncacheable.
            }
        }

        if (isCacheable) {
            const bodyBase64 = Buffer.from(await response.clone().arrayBuffer()).toString('base64');
            await cache.set(cacheKey, {
                bodyBase64,
                headers: Object.fromEntries(response.headers.entries()),
                status: response.status,
                finalUrl: response.url,
            } satisfies CacheData, requestTtl ?? ttl);
        }
        return response;
    };
}

async function fetchWithTimeout(
    fetchImpl: NonNullable<CreateFetcherDependencies['fetch']>,
    input: string | URL | Request,
    options: RequestInit,
    timeout: number | undefined,
    urlString: string,
): Promise<Response> {
    if (!timeout) return fetchImpl(input, options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
    try {
        return await fetchImpl(input, { ...options, signal });
    } catch (error) {
        if (controller.signal.aborted && !options.signal?.aborted) {
            throw new Error(`Request to ${urlString} timed out after ${timeout}ms`, { cause: error });
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
