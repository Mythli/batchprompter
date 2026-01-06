import { GenericHandler } from '../types.js';
import { PluginServices } from '../../plugins/types.js';

export class WikipediaHandler implements GenericHandler {
    name = 'wikipedia';

    canHandle(url: string): boolean {
        return url.includes('wikipedia.org');
    }

    async handle(url: string, services: PluginServices): Promise<string | null> {
        // Wikipedia specific handling (e.g. API) could go here
        // For now, just return null to let generic handlers take over
        return null;
    }
}
