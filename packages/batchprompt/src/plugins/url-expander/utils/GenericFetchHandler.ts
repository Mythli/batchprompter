import { GenericHandler } from './types.js';
import { Fetcher } from 'llm-fns';

export class GenericFetchHandler implements GenericHandler {
    name = 'generic-fetch';

    constructor(private fetcher: Fetcher) {}

    async handle(url: string): Promise<string | null> {
        const response = await this.fetcher(url);
        if (!response || !response.ok) {
            const status = response ? `${response.status} ${response.statusText}` : 'No Response';
            throw new Error(`Fetch failed for ${url}: ${status}`);
        }
        return await response.text();
    }
}
