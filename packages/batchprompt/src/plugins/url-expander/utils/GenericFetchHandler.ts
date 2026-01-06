import { GenericHandler } from './types.js';
import { PluginServices } from '../../types.js';

export class GenericFetchHandler implements GenericHandler {
    name = 'generic-fetch';

    async handle(url: string, services: PluginServices): Promise<string | null> {
        const response = await services.fetcher(url);
        if (!response || !response.ok) {
            const status = response ? `${response.status} ${response.statusText}` : 'No Response';
            throw new Error(`Fetch failed for ${url}: ${status}`);
        }
        return await response.text();
    }
}
