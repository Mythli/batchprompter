import { z } from 'zod';
import { Cache } from 'cache-manager';
import crypto from 'crypto';
import sharp from 'sharp';

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
            const response = await fetch('https://google.serper.dev/images', {
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

        // v2 prefix to invalidate previous potentially corrupted cache entries
        const cacheKey = `image:content:v2:${this.hash(url)}`;

        if (this.cache) {
            try {
                const cached = await this.cache.get(cacheKey);
                if (cached) {
                    // We now explicitly store as base64 string to avoid serialization issues
                    if (typeof cached === 'string') {
                        // console.log(`[ImageSearch] Cache hit for image: ${url}`);
                        return Buffer.from(cached, 'base64');
                    }
                    // Fallback for other types if we revert or migrate
                    if (Buffer.isBuffer(cached)) {
                        return cached;
                    }
                    if (typeof cached === 'object' && (cached as any).type === 'Buffer') {
                        return Buffer.from((cached as any).data);
                    }
                }
            } catch (e) {
                console.warn(`[ImageSearch] Cache read error for ${url}:`, e);
            }
        }

        // console.log(`[ImageSearch] Downloading: ${url}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
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
        try {
            await sharp(buffer).metadata();
        } catch (e) {
            console.warn(`[ImageSearch] Rejected URL ${url} - Invalid image data:`, e);
            throw new Error(`Invalid image data downloaded from ${url}`);
        }

        if (this.cache) {
            try {
                // Store as base64 string
                await this.cache.set(cacheKey, buffer.toString('base64'), 24 * 60 * 60 * 1000);
            } catch (e) {
                console.warn(`[ImageSearch] Cache write error for ${url}:`, e);
            }
        }

        return buffer;
    }
}
