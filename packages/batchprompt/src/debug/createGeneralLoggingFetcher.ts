import { getPromptSummary } from 'llm-fns';

export async function handleGeneralFetch(
    url: RequestInfo | URL,
    init: RequestInit | undefined,
    originalFetch: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<Response> {
    const urlString = typeof url === 'string' ? url : url.toString();
    const method = init?.method || 'GET';

    // Determine request type for logging
    let requestType = 'Fetch';
    if (urlString.includes('serper.dev')) {
        requestType = 'Serper';
    } else if (urlString.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) {
        requestType = 'Image';
    } else if (urlString.match(/\.(mp3|wav|mp4|webm)(\?|$)/i)) {
        requestType = 'Media';
    }

    // Truncate URL for display
    const displayUrl = getPromptSummary([{ role: 'user', content: urlString }]);

    console.log(`[${requestType}] ${method} ${displayUrl}`);

    const startTime = Date.now();

    try {
        const response = await originalFetch(url, init);
        const duration = Date.now() - startTime;

        const contentType = response.headers.get('content-type') || 'unknown';
        const contentLength = response.headers.get('content-length');
        const sizeInfo = contentLength ? ` (${formatBytes(parseInt(contentLength, 10))})` : '';

        if (response.ok) {
            console.log(`[${requestType}] DONE ${response.status} in ${duration}ms - ${contentType.split(';')[0]}${sizeInfo}`);
        } else {
            console.warn(`[${requestType}] FAIL ${response.status} ${response.statusText} in ${duration}ms - ${displayUrl}`);
        }

        return response;
    } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(`[${requestType}] ERROR in ${duration}ms - ${error.message} - ${displayUrl}`);
        throw error;
    }
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function createGeneralLoggingFetcher(
    fetcher?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    const originalFetch = fetcher || globalThis.fetch;

    return async (url: RequestInfo | URL, init?: RequestInit) => {
        return handleGeneralFetch(url, init, originalFetch);
    };
}
