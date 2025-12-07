import { UrlExpanderBase } from './UrlExpanderBase.js';
import { PreprocessorContext } from './types.js';

export class FetchUrlExpanderPlugin extends UrlExpanderBase {
    name = 'fetch-url-expander';
    flagName = 'expand-urls-fetch';

    async fetchContent(url: string, context: PreprocessorContext): Promise<string | null> {
        const response = await context.services.fetcher(url);
        if (!response.ok) return null;
        return await response.text();
    }
}
