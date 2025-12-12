import OpenAI from 'openai';
import { z } from 'zod';
import { BoundLlmClient } from '../core/BoundLlmClient.js';
import { ImageSearch, ImageSearchResult } from '../plugins/image-search/ImageSearch.js';
import { SpriteGenerator } from './SpriteGenerator.js';

export class AiImageSearch {
    constructor(
        private imageSearch: ImageSearch,
        private selectLlm: BoundLlmClient,
        private imagesPerSprite: number = 4
    ) {}

    async search(query: string, count: number): Promise<ImageSearchResult[]> {
        return this.imageSearch.search(query, count);
    }

    async selectFromPool(
        images: ImageSearchResult[],
        row: Record<string, any>,
        maxSelected: number = 1,
        onSprite?: (buffer: Buffer, index: number) => Promise<void>,
        spriteSizeOverride?: number
    ): Promise<ImageSearchResult[]> {
        if (images.length === 0) return [];

        const spriteSize = spriteSizeOverride || this.imagesPerSprite;

        const chunks: ImageSearchResult[][] = [];
        for (let i = 0; i < images.length; i += spriteSize) {
            chunks.push(images.slice(i, i + spriteSize));
        }

        console.log(`[AiImageSearch] Generating ${chunks.length} sprite(s) from ${images.length} images (Grid size: ${spriteSize})...`);

        const spritePromises = chunks.map(async (chunk, i) => {
            const startNum = (i * spriteSize) + 1;
            try {
                const result = await SpriteGenerator.generate(chunk, startNum);
                return { ...result, startNum, chunk, success: true };
            } catch (e) {
                console.warn(`[AiImageSearch] Failed to generate sprite for chunk ${i}:`, e);
                return { success: false, startNum, chunk, spriteBuffer: Buffer.alloc(0), validIndices: [] };
            }
        });

        const sprites = (await Promise.all(spritePromises)).filter(s => s.success);

        if (sprites.length === 0) {
            throw new Error("Failed to generate any valid sprites from search results.");
        }

        if (onSprite) {
            for (let i = 0; i < sprites.length; i++) {
                await onSprite(sprites[i].spriteBuffer, i);
            }
        }

        const imageContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        const indexMap = new Map<number, ImageSearchResult>();

        for (const sprite of sprites) {
            const base64Sprite = sprite.spriteBuffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64Sprite}`;

            imageContentParts.push({ type: 'image_url', image_url: { url: dataUrl } });

            sprite.validIndices.forEach((originalIndexInChunk, i) => {
                const visualIndex = sprite.startNum + i;
                indexMap.set(visualIndex, sprite.chunk[originalIndexInChunk]);
            });
        }

        const SelectionSchema = z.object({
            selected_indices: z.array(z.number()).describe(`The numbers visible on the selected images (1-based). Select up to ${maxSelected} indices.`),
            reasoning: z.string().describe("Why these images were selected based on the prompt")
        });

        const preamble: OpenAI.Chat.Completions.ChatCompletionContentPart = {
            type: 'text',
            text: `You are an image selection assistant. You will see numbered images in sprite sheets. Each image has a red border and a number in the top-left corner. Select the best ${maxSelected} image(s) by returning their visible numbers. The images are shown below:`
        };

        console.log(`[AiImageSearch] Asking AI to select up to ${maxSelected} images...`);
        const response = await this.selectLlm.promptZod(
            {
                prefix: [preamble],
                suffix: imageContentParts
            },
            SelectionSchema
        );

        console.log(`[AiImageSearch] AI Selected: ${response.selected_indices.join(', ')}. Reason: ${response.reasoning}`);

        const selectedImages: ImageSearchResult[] = [];
        const indicesToProcess = response.selected_indices.slice(0, maxSelected);

        for (const visualIndex of indicesToProcess) {
            const img = indexMap.get(visualIndex);
            if (img) {
                selectedImages.push(img);
            } else {
                console.warn(`[AiImageSearch] AI selected index ${visualIndex} which is not mapped to a valid image.`);
            }
        }

        return selectedImages;
    }

    getImageSearch(): ImageSearch {
        return this.imageSearch;
    }
}
