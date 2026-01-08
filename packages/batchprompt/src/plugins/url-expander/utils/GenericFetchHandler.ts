import { GenericHandler } from './types.js';
import { PluginServices } from '../../types.js';
import { Fetcher } from 'llm-fns';

export class GenericFetchHandler implements GenericHandler {
    name = 'generic-fetch';

    constructor(private fetcher?: Fetcher) {}

    async handle(url: string, services: PluginServices): Promise<string | null> {
        if (!this.fetcher) {
            throw new Error("[GenericFetchHandler] Fetcher not available.");
        }
        const response = await this.fetcher(url);
        if (!response || !response.ok) {
            const status = response ? `${response.status} ${response.statusText}` : 'No Response';
            throw new Error(`Fetch failed for ${url}: ${status}`);
        }
        return await response.text();
    }
}
