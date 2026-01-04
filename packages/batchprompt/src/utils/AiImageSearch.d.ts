import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../src/core/BoundLlmClient.js';
import { ImageSearch, ImageSearchResult } from '../src/plugins/image-search/ImageSearch.js';
import { LlmListSelector } from './LlmListSelector.js';
export declare class AiImageSearch {
    private imageSearch;
    private queryLlm?;
    private selector?;
    private imagesPerSprite;
    readonly events: EventEmitter<string | symbol, any>;
    constructor(imageSearch: ImageSearch, queryLlm?: BoundLlmClient, selector?: LlmListSelector | undefined, imagesPerSprite?: number);
    process(row: Record<string, any>, config: {
        query?: string;
        limit: number;
        queryCount: number;
        maxPages: number;
        dedupeStrategy: 'none' | 'domain' | 'url';
        gl?: string;
        hl?: string;
    }): Promise<ImageSearchResult[]>;
    private selectFromPool;
    getImageSearch(): ImageSearch;
}
//# sourceMappingURL=AiImageSearch.d.ts.map