import { GenericHandler } from './types.js';
import { PreprocessorServices } from '../types.js';

export class GenericFetchHandler implements GenericHandler {
    name = 'generic-fetch';

    async handle(url: string, services: PreprocessorServices): Promise<string | null> {
        const response = await services.fetcher(url);
        if (!response.ok) {
            throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    }
}
