import { GenericHandler } from './types.js';
import { PluginServices } from '../../plugins/types.js';

export class GenericFetchHandler implements GenericHandler {
    name = 'generic-fetch';

    async handle(url: string, services: PluginServices): Promise<string | null> {
        try {
            const response = await services.fetcher(url);
            if (!response.ok) return null;
            return await response.text();
        } catch (e) {
            console.warn(`[GenericFetchHandler] Failed to fetch ${url}`, e);
            return null;
        }
    }
}
