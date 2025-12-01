// src/lib/createCachedFetcher.ts

import { Cache } from 'cache-manager';
import { EventTracker } from './EventTracker.js';
import { ProxyAgent } from 'undici';
import { DomainQueue } from './DomainQueue.js';

// Define a custom options type that extends RequestInit with our custom `ttl` property.
export type FetcherOptions = RequestInit & {
    /** Optional TTL override for this specific request, in milliseconds. */
    ttl?: number;
};

// Define the shape of the function we are creating and exporting.
// It must match the native fetch signature, but with our custom options.
export type Fetcher = (
    url: string | URL | Request,
    options?: FetcherOptions
) => Promise<Response>;

// Define the dependencies needed to create our cached fetcher.
export interface CreateFetcherDependencies {
    /** The cache instance (e.g., from cache-manager). */
    cache?: Cache;
    /** A prefix for all cache keys to avoid collisions. */
    prefix: string;
    /** Time-to-live for cache entries, in milliseconds. */
    ttl?: number;
    /** Request timeout in milliseconds. */
    timeout: number;
    /** User-Agent string for requests. */
    userAgent?: string;
    domainQueue: DomainQueue;
    eventTracker?: EventTracker;
    proxyUrl?: string;
}

// The data we store in the cache. Kept internal to this module.
// The body is stored as a base64 string to ensure proper serialization in Redis.
interface CacheData {
    bodyBase64: string;
    headers: Record<string, string>;
    status: number;
    finalUrl: string; // Crucial for resolving relative URLs on cache HITs
}

// A custom Response class to correctly handle the `.url` property on cache HITs.
// This is an implementation detail and doesn't need to be exported.
export class CachedResponse extends Response {
    #finalUrl: string;

    constructor(body: BodyInit | null, init: ResponseInit, finalUrl: string) {
        super(body, init);
        this.#finalUrl = finalUrl;
    }

    // Override the read-only `url` property
    get url() {
        return this.#finalUrl;
    }
}

/**
 * Factory function that creates a `fetch` replacement with a caching layer.
 * @param deps - Dependencies including the cache instance, prefix, TTL, and timeout.
 * @returns A function with the same signature as native `fetch`.
 */
export function createCachedFetcher(deps: CreateFetcherDependencies): Fetcher {
    const { cache, prefix, ttl, timeout, userAgent, domainQueue, eventTracker, proxyUrl } = deps;

    const fetchWithTimeout = async (url: string | URL | Request, options?: RequestInit): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            const urlString = typeof url === 'string' ? url : url.toString();
            console.log(`[Fetch Timeout] Request timed out after ${timeout}ms for: ${urlString}`);
            controller.abort();
        }, timeout);

        const finalOptions: RequestInit = {
            ...options,
            headers: {
                ...options?.headers,
                ...(userAgent ? { 'User-Agent': userAgent } : {}),
            },
            signal: controller.signal,
        };

        if (proxyUrl) {
            // @ts-ignore
            finalOptions.dispatcher = new ProxyAgent(proxyUrl);
        }

        try {
            const response = await fetch(url, finalOptions);
            return response;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                const urlString = typeof url === 'string' ? url : url.toString();
                throw new Error(`Request to ${urlString} timed out after ${timeout}ms`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    // This is the actual fetcher implementation, returned by the factory.
    // It "closes over" the dependencies provided to the factory.
    return async (url: string | URL | Request, options?: FetcherOptions): Promise<Response> => {
        // Determine the request method. Default to GET for fetch.
        let method = 'GET';
        if (options?.method) {
            method = options.method;
        } else if (url instanceof Request) {
            method = url.method;
        }

        // --- [MODIFIED] --- Only apply caching for GET requests.
        // For all other methods, or if cache is not configured, bypass the cache entirely.
        if (method.toUpperCase() !== 'GET' || !cache) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (method.toUpperCase() !== 'GET') {
                console.log(`[Cache SKIP] Non-GET request (${method}) to: ${urlString}`);
            } else {
                console.log(`[Cache SKIP] Cache not configured for request to: ${urlString}`);
            }
            return domainQueue.add(urlString, () => fetchWithTimeout(url, options));
        }

        const urlString = typeof url === 'string' ? url : url.toString();
        const cacheKey = `${prefix}:${urlString}`;

        // 1. Check the cache
        const cachedItem = await cache.get<CacheData>(cacheKey);
        if (cachedItem) {
            // Decode the base64 body back into a Buffer.
            const body = Buffer.from(cachedItem.bodyBase64, 'base64');
            return new CachedResponse(
                body,
                {
                    status: cachedItem.status,
                    headers: cachedItem.headers,
                },
                cachedItem.finalUrl
            );
        }

        // 2. Perform the actual fetch if not in cache
        const fetchAndCache = async () => {
            const response = await domainQueue.add(urlString, () => fetchWithTimeout(url, options));

            // 3. Store in cache on success
            if (response.ok) {
                const responseClone = response.clone();
                const bodyBuffer = await responseClone.arrayBuffer();
                // Convert ArrayBuffer to a base64 string for safe JSON serialization.
                const bodyBase64 = Buffer.from(bodyBuffer).toString('base64');
                const headers = Object.fromEntries(response.headers.entries());

                const itemToCache: CacheData = {
                    bodyBase64,
                    headers,
                    status: response.status,
                    finalUrl: response.url,
                };

                await cache.set(cacheKey, itemToCache, options?.ttl ?? ttl);
                console.log(`[Cache SET] for: ${cacheKey}`);
            }

            // 4. Return the original response
            return response;
        };

        if (eventTracker) {
            return eventTracker.trackOperation('fetcher.fetch', { url: urlString }, fetchAndCache);
        }
        return fetchAndCache();
    };
}
