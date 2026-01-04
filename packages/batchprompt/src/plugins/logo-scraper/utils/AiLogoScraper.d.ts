import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../../../core/BoundLlmClient.js';
import { PuppeteerHelper } from '../../../../utils/puppeteer/PuppeteerHelper.js';
import { ImageDownloader } from './ImageDownloader.js';
export interface LogoScraperOptions {
    maxLogosToAnalyze?: number;
    brandLogoScoreThreshold?: number;
}
export declare class AiLogoScraper {
    private puppeteerHelper;
    private analyzeLlm;
    private extractLlm;
    private imageDownloader;
    private options;
    readonly events: EventEmitter<string | symbol, any>;
    constructor(puppeteerHelper: PuppeteerHelper, analyzeLlm: BoundLlmClient, extractLlm: BoundLlmClient, imageDownloader: ImageDownloader, options?: LogoScraperOptions);
    scrape(url: string): Promise<{}>;
    private fetchFavicons;
    private findLogoUrlsByLlm;
    private findInlineLogosByLlm;
    private normalizeLogos;
}
//# sourceMappingURL=AiLogoScraper.d.ts.map