import { z } from 'zod';
import PQueue from 'p-queue';
import { Fetcher } from "llm-fns";
declare const OrganicResultSchema: z.ZodObject<{
    title: z.ZodString;
    link: z.ZodString;
    snippet: z.ZodOptional<z.ZodString>;
    position: z.ZodOptional<z.ZodNumber>;
    date: z.ZodOptional<z.ZodString>;
    sitelinks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        link: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        link: string;
        title: string;
    }, {
        link: string;
        title: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    link: string;
    title: string;
    date?: string | undefined;
    position?: number | undefined;
    snippet?: string | undefined;
    sitelinks?: {
        link: string;
        title: string;
    }[] | undefined;
}, {
    link: string;
    title: string;
    date?: string | undefined;
    position?: number | undefined;
    snippet?: string | undefined;
    sitelinks?: {
        link: string;
        title: string;
    }[] | undefined;
}>;
export type WebSearchResult = z.infer<typeof OrganicResultSchema> & {
    content?: string;
    domain?: string;
    type: 'seo';
};
export type WebSearchMode = 'none' | 'markdown' | 'html';
export declare class WebSearch {
    private apiKey;
    private fetcher;
    private queue;
    constructor(apiKey: string, fetcher: Fetcher, queue: PQueue);
    search(query: string, num?: number, page?: number, gl?: string, hl?: string): Promise<WebSearchResult[]>;
    fetchContent(url: string, mode: WebSearchMode): Promise<string>;
    private htmlToMarkdown;
}
export {};
//# sourceMappingURL=WebSearch.d.ts.map