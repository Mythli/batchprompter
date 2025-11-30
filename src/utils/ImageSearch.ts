import { z } from 'zod';

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
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(query: string, num: number = 10): Promise<SerperImage[]> {
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
        return parsed.images;
    }
}
