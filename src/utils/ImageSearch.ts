import { z } from 'zod';
import { Cache } from 'cache-manager';
import crypto from 'crypto';
import sharp from 'sharp';
import { Fetcher } from './createCachedFetcher.js';

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
});

const SerperResponseSchema = z.object({
  searchParameters: SearchParametersSchema,
  images: z.array(ImageSchema),
});

export type SerperImage = z.infer<typeof ImageSchema>;

export interface ImageSearchResult {
    metadata: SerperImage;
    buffer: Buffer;
}

export class ImageSearch {
    constructor(
        private apiKey: string,
        private fetcher: Fetcher,
        private cache?: Cache
    ) {}

    private hash(input: string): string {
        return crypto.createHash('md5').update(input).digest('hex');
    }

    async search(query: string, num: number = 10): Promise<ImageSearchResult[]> {
        // Bumped version to v2 to invalidate potentially bad cache
        const cacheKey = `serper:search:v2:${this.hash(query)}:${num}`;
        let images: SerperImage[] = [];

        if (this.cache) {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                console.log(`[ImageSearch] Cache hit for query: "${query}"`);
                // We assume cached data is valid JSON matching the schema
                images = cached as SerperImage[];
            }
        }

        if (images.length === 0) {
            console.log(`[ImageSearch] API call for query: "${query}"`);
            
            // Use the fetcher for the network call. 
            // Note: cachedFetcher currently only caches GET requests, so this POST won't be cached by the fetcher itself.
            // We rely on the manual caching block above/below for the API results.
            const response = await this.fetcher('https://google.serper.dev/images', {
                method: 'POST',
                headers: {
                    'X-API-KEY': this.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    q: query,
                    num: num
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();

            // Validate with Zod
            try {
                const parsed = SerperResponseSchema.parse(json);
                images = parsed.images;

                if (this.cache) {
                    // Cache for 24 hours (in milliseconds)
                    await this.cache.set(cacheKey, images, 24 * 60 * 60 * 1000);
                }
            } catch (e) {
                console.error("[ImageSearch] Failed to parse Serper API response:", e);
                throw e;
            }
        }

        // Download images immediately and filter out failures
        const results = await Promise.all(images.map(async (img) => {
            try {
                const buffer = await this.download(img.imageUrl);
                return { metadata: img, buffer };
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
