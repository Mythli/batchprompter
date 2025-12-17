export function summarize(text: string, limit: number = 50): string {
    if (!text) return '';
    // Remove newlines for cleaner logs
    const clean = text.replace(/\s+/g, ' ').trim();
    
    if (clean.length <= limit * 3) return clean;
    
    const start = clean.substring(0, limit);
    const end = clean.substring(clean.length - limit);
    const midStart = Math.floor(clean.length / 2) - Math.floor(limit / 2);
    const middle = clean.substring(midStart, midStart + limit);
    
    return `${start}...${middle}...${end}`;
}

function isAiRequest(url: string | URL | Request, init?: RequestInit): boolean {
    const urlString = typeof url === 'string' ? url : url.toString();
    
    // Check for common AI API endpoints
    if (urlString.includes('api.openai.com') ||
        urlString.includes('openrouter.ai') ||
        urlString.includes('api.anthropic.com') ||
        urlString.includes('generativelanguage.googleapis.com')) {
        return true;
    }
    
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

async function handleAiRequest(
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
                const lastMessage = body.messages[body.messages.length - 1];
                if (lastMessage?.content) {
                    let content = lastMessage.content;
                    if (Array.isArray(content)) {
                        content = content
                            .filter((p: any) => p.type === 'text')
                            .map((p: any) => p.text)
                            .join(' ');
                    }
                    console.log(`[LLM] [${requestModel}] Executing: ${summarize(String(content))}`);
                }
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
                console.log(`[LLM] [${responseModel}] DONE ${response.status}: ${summarize(data.choices[0].message.content)}`);
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

async function handleGeneralFetch(
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
    const displayUrl = urlString.length > 80 
        ? urlString.substring(0, 77) + '...' 
        : urlString;
    
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
