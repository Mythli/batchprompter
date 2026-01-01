import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { SiteHandler, GenericHandler } from '../types.js';
import { PreprocessorServices } from '../../../types.js';

export class WikipediaHandler implements SiteHandler {
    name = 'wikipedia';

    canHandle(url: string): boolean {
        return /wikipedia\.org\/wiki\//i.test(url);
    }

    async handle(url: string, services: PreprocessorServices, genericHandler: GenericHandler): Promise<string | null> {
        console.log(`[WikipediaHandler] Processing ${url} using ${genericHandler.name}`);

        // Delegate fetching to the injected generic handler
        const html = await genericHandler.handle(url, services);
        if (!html) {
            throw new Error(`[WikipediaHandler] No content returned for ${url}`);
        }

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
