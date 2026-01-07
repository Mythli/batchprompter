import { getPromptSummary } from 'llm-fns';

export function isAiRequest(url: string | URL | Request, init?: RequestInit): boolean {
    const urlString = typeof url === 'string' ? url : url.toString();

    // Check for chat completions endpoint pattern
    if (urlString.includes('/chat/completions') ||
        urlString.includes('/v1/completions') ||
        urlString.includes('/v1/images/generations')) {
        return true;
    }

    // Check if body looks like an AI request
    if (init?.body && typeof init.body === 'string') {
        try {
            if (init.body.trim().startsWith('{')) {
                const body = JSON.parse(init.body);
                if (body.messages && Array.isArray(body.messages)) {
                    return true;
                }
                if (body.model && (body.prompt || body.messages)) {
                    return true;
                }
            }
        } catch {
            // Not JSON, not an AI request
        }
    }

    return false;
}

export async function handleAiRequest(
    url: RequestInfo | URL,
    init: RequestInit | undefined,
    originalFetch: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<Response> {
    let requestModel = 'unknown';

    // Log Request
    try {
        if (init?.body && typeof init.body === 'string') {
            const body = JSON.parse(init.body);

            if (body.model) {
                requestModel = body.model;
            }

            if (body.messages && Array.isArray(body.messages)) {
                console.log(`[LLM] [${requestModel}] Executing: ${getPromptSummary(body.messages)}`);
            }
        }
    } catch {
        // Ignore logging errors
    }

    // Execute
    const response = await originalFetch(url, init);

    // Log Response
    const clone = response.clone();
    try {
        const contentType = clone.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await clone.json();
            const responseModel = data.model || requestModel;

            if (data.choices && data.choices[0]?.message?.content) {
                console.log(`[LLM] [${responseModel}] DONE ${response.status}: ${getPromptSummary([{ role: 'assistant', content: data.choices[0].message.content }])}`);
            } else if (data.error) {
                console.error(`[LLM] [${responseModel}] ERROR ${response.status}:`, data.error);
            } else {
                console.log(`[LLM] [${responseModel}] DONE ${response.status}`);
            }
        }
    } catch {
        // Ignore logging errors
    }

    return response;
}

export function createAiLoggingFetcher(
    fetcher?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    const originalFetch = fetcher || globalThis.fetch;

    return async (url: RequestInfo | URL, init?: RequestInit) => {
        if (isAiRequest(url, init)) {
            return handleAiRequest(url, init, originalFetch);
        }
        return originalFetch(url, init);
    };
}
