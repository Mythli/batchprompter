export function summarize(text: string): string {
    if (!text) return '';
    // Remove newlines for cleaner logs
    const clean = text.replace(/\s+/g, ' ').trim();
    
    const limit = 50;
    if (clean.length <= limit * 3) return clean;
    
    const start = clean.substring(0, limit);
    const end = clean.substring(clean.length - limit);
    const midStart = Math.floor(clean.length / 2) - Math.floor(limit / 2);
    const middle = clean.substring(midStart, midStart + limit);
    
    return `${start}...${middle}...${end}`;
}

export function createLoggingFetcher(
    fetcher?: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    const originalFetch = fetcher || globalThis.fetch;

    return async (url: RequestInfo | URL, init?: RequestInit) => {
        // 1. Log Request
        try {
            if (init?.body && typeof init.body === 'string') {
                // Only try to parse if it looks like JSON (OpenAI requests are JSON)
                if (init.body.trim().startsWith('{')) {
                    const body = JSON.parse(init.body);
                    if (body.messages && Array.isArray(body.messages)) {
                        // Find the last message (usually user)
                        const lastMessage = body.messages[body.messages.length - 1];
                        if (lastMessage?.content) {
                            let content = lastMessage.content;
                            if (Array.isArray(content)) {
                                content = content
                                    .filter((p: any) => p.type === 'text')
                                    .map((p: any) => p.text)
                                    .join(' ');
                            }
                            console.log(`[LLM] Executing: ${summarize(String(content))}`);
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore logging errors
        }

        // 2. Execute
        const response = await originalFetch(url, init);

        // 3. Log Response
        // Clone to read body
        const clone = response.clone();
        try {
            // Only parse if JSON
            const contentType = clone.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await clone.json();
                if (data.choices && data.choices[0]?.message?.content) {
                    console.log(`[LLM] DONE ${response.status}: ${summarize(data.choices[0].message.content)}`);
                } else if (data.error) {
                    console.error(`[LLM] ERROR ${response.status}:`, data.error);
                } else {
                    console.log(`[LLM] DONE ${response.status}`);
                }
            } else {
                 // console.log(`[LLM] DONE ${response.status} (Non-JSON)`);
            }
        } catch (e) {
             // Ignore logging errors
        }

        return response;
    };
}
