import { z } from 'zod';
import sharp from 'sharp';
import PQueue from 'p-queue';
import {Fetcher} from "llm-fns";

// Zod Schemas
const ImageSchema = z.object({
  title: z.string(),
  imageUrl: z.string(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  thumbnailUrl: z.string().optional(),
  thumbnailWidth: z.number().optional(),
  thumbnailHeight: z.number().optional(),
  source: z.string().optional(),
  domain: z.string().optional(),
  link: z.string().optional(),
  googleUrl: z.string().optional(),
  position: z.number().optional(),
});

const SearchParametersSchema = z.object({
  q: z.string(),
  type: z.string(),
  num: z.number(),
  engine: z.string(),
  gl: z.string().optional(),
  hl: z.string().optional(),
  page: z.number().optional(),
});

const SerperResponseSchema = z.object({
  searchParameters: SearchParametersSchema,
  images: z.array(ImageSchema).optional(),
});

export type SerperImage = z.infer<typeof ImageSchema>;

// Explicitly define ImageSearchResult to require position
export interface ImageSearchResult {
    metadata: SerperImage & { position: number };
    buffer: Buffer;
}

export class ImageSearch {
    constructor(
        private apiKey: string,
        private fetcher: Fetcher,
        private queue: PQueue
    ) {}

    async search(query: string, num: number = 10, page: number = 1, gl?: string, hl?: string): Promise<ImageSearchResult[]> {
        console.log(`[ImageSearch] Searching for query: "${query}" (Page: ${page}, Limit: ${num}, GL: ${gl}, HL: ${hl})`);

        const body: any = {
            q: query,
            num: num,
            page: page
        };
        if (gl) body.gl = gl;
        if (hl) body.hl = hl;

        // Use the fetcher for the network call.
        // The fetcher handles caching (including POST requests) and retries/timeouts.
        // Wrapped in queue to limit concurrency.
        const response = await this.queue.add(() => this.fetcher('https://google.serper.dev/images', {
            method: 'POST',
            headers: {
                'X-API-KEY': this.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }));

        if (!response) {
            throw new Error("Queue execution failed or returned undefined response.");
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        let images: SerperImage[] = [];

        // Validate with Zod
        try {
            const parsed = SerperResponseSchema.parse(json);
            images = parsed.images || [];
        } catch (e) {
            console.error("[ImageSearch] Failed to parse Serper API response:", e);
            throw e;
        }

        // Download images immediately and filter out failures
        const results = await Promise.all(images.map(async (img, index): Promise<ImageSearchResult | null> => {
            try {
                const buffer = await this.download(img.imageUrl);
                // Calculate absolute position
                const position = (page - 1) * num + (img.position || (index + 1));
                return { metadata: { ...img, position }, buffer };
            } catch (e) {
                // console.warn(`[ImageSearch] Failed to download ${img.imageUrl}:`, e);
                return null;
            }
        }));

        return results.filter((r): r is ImageSearchResult => r !== null);
    }

    async download(url: string): Promise<Buffer> {
        if (!url) {
            throw new Error("Image URL is undefined or empty");
        }

        // Use the cached fetcher. It handles caching, domain queuing, and timeouts.
        const response = await this.fetcher(url);

        if (!response.ok) throw new Error(`Failed to fetch image: ${url} (${response.status})`);

        // Validate Content-Type to ensure it's an image
        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.startsWith('image/') && !contentType.startsWith('application/octet-stream')) {
            console.warn(`[ImageSearch] Rejected URL ${url} due to content-type: ${contentType}`);
            throw new Error(`Invalid content-type for image: ${contentType}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate image integrity with Sharp
        // Note: If the image came from cache, it might be invalid if it was cached before validation logic changed.
        // However, cachedFetcher doesn't validate before caching.
        // We validate here to ensure we don't return bad data to the app.
        try {
            await sharp(buffer).metadata();
        } catch (e) {
            console.warn(`[ImageSearch] Rejected URL ${url} - Invalid image data:`, e);
            throw new Error(`Invalid image data downloaded from ${url}`);
        }

        return buffer;
    }
}
