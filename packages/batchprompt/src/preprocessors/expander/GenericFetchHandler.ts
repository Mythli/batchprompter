import { GenericHandler } from './types.js';
import { PluginServices } from '../../plugins/types.js';

export class GenericFetchHandler implements GenericHandler {
    name = 'generic-fetch';

    canHandle(url: string): boolean {
        return true; // Fallback
    }

    async handle(url: string, services: PluginServices): Promise<string | null> {
        try {
            const response = await services.fetcher(url);
            if (!response.ok) return null;
            return await response.text();
        } catch (e) {
            return null;
        }
    }
}
