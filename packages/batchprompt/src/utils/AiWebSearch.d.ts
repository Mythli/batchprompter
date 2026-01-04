import OpenAI from 'openai';
import { EventEmitter } from 'eventemitter3';
import { BoundLlmClient } from '../src/core/BoundLlmClient.js';
import { WebSearch, WebSearchResult, WebSearchMode } from '../src/plugins/web-search/WebSearch.js';
import { LlmListSelector } from './LlmListSelector.js';
export declare class AiWebSearch {
    private webSearch;
    private queryLlm?;
    private selector?;
    private compressLlm?;
    readonly events: EventEmitter<string | symbol, any>;
    constructor(webSearch: WebSearch, queryLlm?: BoundLlmClient, selector?: LlmListSelector | undefined, compressLlm?: BoundLlmClient);
    process(row: Record<string, any>, config: {
        query?: string;
        limit: number;
        mode: WebSearchMode;
        queryCount: number;
        maxPages: number;
        dedupeStrategy: 'none' | 'domain' | 'url';
        gl?: string;
        hl?: string;
    }): Promise<{
        contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
        data: WebSearchResult[];
    }>;
}
//# sourceMappingURL=AiWebSearch.d.ts.map