import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { SiteHandler } from '../types.js';
import { GenericFetchHandler } from '../GenericFetchHandler.js';
import { PluginServices } from '../../../plugins/types.js';

export class WikipediaHandler implements SiteHandler {
    name = 'wikipedia';

    constructor(private fetchHandler: GenericFetchHandler) {}

    canHandle(url: string): boolean {
        return /wikipedia\.org\/wiki\//i.test(url);
    }

    async handle(url: string, services: PluginServices): Promise<string | null> {
        console.log(`[WikipediaHandler] Processing ${url}`);

        // Delegate fetching to the generic handler
        const html = await this.fetchHandler.handle(url, services);
        if (!html) return null;

        // Specific parsing logic
        const $ = cheerio.load(html);

        // Wikipedia stores the main article in #mw-content-text
        const content = $('#mw-content-text');

        // Cleanup specific Wikipedia noise
        content.find('.mw-editsection').remove(); // [edit] links
        content.find('.reference').remove();      // [1] citations
        content.find('.reflist').remove();        // Reference list at bottom
        content.find('table.infobox').remove();   // Infoboxes
        content.find('#toc').remove();            // Table of contents
        content.find('style, script').remove();

        const turndownService = new TurndownService();
        const wikipediaArticle = turndownService.turndown(content.html() || '');
        return wikipediaArticle;
    }
}
