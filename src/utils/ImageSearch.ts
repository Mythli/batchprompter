import { z } from 'zod';
import { Cache } from 'cache-manager';
import crypto from 'crypto';

// Zod Schemas
const ImageSchema = z.object({
  title: z.string(),
  imageUrl: z.string(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  thumbnailUrl: z.string(),
  thumbnailWidth: z.number(),
  thumbnailHeight: z.number(),
  source: z.string(),
  domain: z.string(),
  link: z.string(),
  googleUrl: z.string(),
  position: z.number(),
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

export class ImageSearch {
    constructor(
        private apiKey: string,
        private cache?: Cache
    ) {}

    private hash(input: string): string {
        return crypto.createHash('md5').update(input).digest('hex');
    }

    async search(query: string, num: number = 10): Promise<SerperImage[]> {
        const cacheKey = `serper:search:${this.hash(query)}:${num}`;

        if (this.cache) {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                console.log(`[ImageSearch] Cache hit for query: "${query}"`);
                // We assume cached data is valid JSON matching the schema
                return cached as SerperImage[];
            }
        }

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
        const parsed = SerperResponseSchema.parse(json);
        const images = parsed.images;

        if (this.cache) {
            // Cache for 24 hours (in milliseconds)
            await this.cache.set(cacheKey, images, 24 * 60 * 60 * 1000);
        }

        return images;
    }

    async download(url: string): Promise<Buffer> {
        const cacheKey = `image:content:${this.hash(url)}`;

        if (this.cache) {
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                // Keyv/Cache-manager might return it as a Buffer or a JSON object representing a Buffer
                if (Buffer.isBuffer(cached)) {
                    return cached;
                } else if (typeof cached === 'object' && (cached as any).type === 'Buffer') {
                    return Buffer.from((cached as any).data);
                } else if (typeof cached === 'string') {
                    // Assuming base64 string storage if serialization happened
                    return Buffer.from(cached, 'base64');
                }
            }
        }

        // console.log(`[ImageSearch] Downloading: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (this.cache) {
            // Cache indefinitely (or very long time)
            // We store as base64 string to be safe with JSON serialization in some cache stores,
            // though KeyvSqlite handles Buffers usually. Let's store as Buffer and let the store handle it.
            await this.cache.set(cacheKey, buffer, 24 * 60 * 60 * 1000);
        }

        return buffer;
    }
}
