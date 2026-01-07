import { isAiRequest, handleAiRequest } from './createAiLoggingFetcher';
import { handleGeneralFetch } from './createGeneralLoggingFetcher';

export function createLoggingFetcher(
    fetcher?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    const originalFetch = fetcher || globalThis.fetch;

    return async (url: RequestInfo | URL, init?: RequestInit) => {
        if (isAiRequest(url, init)) {
            return handleAiRequest(url, init, originalFetch);
        } else {
            return handleGeneralFetch(url, init, originalFetch);
        }
    };
}
