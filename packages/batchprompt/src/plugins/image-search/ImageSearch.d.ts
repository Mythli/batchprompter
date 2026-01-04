import { z } from 'zod';
import PQueue from 'p-queue';
import { Fetcher } from "llm-fns";
declare const ImageSchema: z.ZodObject<{
    title: z.ZodString;
    imageUrl: z.ZodString;
    imageWidth: z.ZodNumber;
    imageHeight: z.ZodNumber;
    thumbnailUrl: z.ZodOptional<z.ZodString>;
    thumbnailWidth: z.ZodOptional<z.ZodNumber>;
    thumbnailHeight: z.ZodOptional<z.ZodNumber>;
    source: z.ZodOptional<z.ZodString>;
    domain: z.ZodOptional<z.ZodString>;
    link: z.ZodOptional<z.ZodString>;
    googleUrl: z.ZodOptional<z.ZodString>;
    position: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    title: string;
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    link?: string | undefined;
    source?: string | undefined;
    thumbnailUrl?: string | undefined;
    thumbnailWidth?: number | undefined;
    thumbnailHeight?: number | undefined;
    domain?: string | undefined;
    googleUrl?: string | undefined;
    position?: number | undefined;
}, {
    title: string;
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    link?: string | undefined;
    source?: string | undefined;
    thumbnailUrl?: string | undefined;
    thumbnailWidth?: number | undefined;
    thumbnailHeight?: number | undefined;
    domain?: string | undefined;
    googleUrl?: string | undefined;
    position?: number | undefined;
}>;
export type SerperImage = z.infer<typeof ImageSchema>;
export interface ImageSearchResult {
    metadata: SerperImage & {
        position: number;
    };
    buffer: Buffer;
}
export declare class ImageSearch {
    private apiKey;
    private fetcher;
    private queue;
    constructor(apiKey: string, fetcher: Fetcher, queue: PQueue);
    search(query: string, num?: number, page?: number, gl?: string, hl?: string): Promise<ImageSearchResult[]>;
    download(url: string): Promise<Buffer>;
}
export {};
//# sourceMappingURL=ImageSearch.d.ts.map