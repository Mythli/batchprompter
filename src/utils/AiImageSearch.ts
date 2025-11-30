import { z } from 'zod';
import { LlmClient } from 'llm-fns';
import { ImageSearch, SerperImage } from './ImageSearch.js';
import { SpriteGenerator } from './SpriteGenerator.js';

export class AiImageSearch {
    constructor(
        private imageSearch: ImageSearch,
        private llm: LlmClient,
        private imagesPerSprite: number = 9
    ) {}

    /**
     * Searches for images, creates one or more sprites, and asks the AI to select the best one(s).
     * 
     * @param searchQuery The query to send to the search engine (e.g. "sailing boat")
     * @param selectionPrompt The criteria for the AI (e.g. "Select the image that looks most heroic")
     * @param count Total number of images to fetch from search (default 9)
     * @param maxSelected Maximum number of images to select (default 1)
     * @returns The selected SerperImage object(s)
     */
    async searchAndSelect(
        searchQuery: string, 
        selectionPrompt: string, 
        count: number = 9,
        maxSelected: number = 1
    ): Promise<SerperImage[]> {
        // 1. Search
        console.log(`[AiImageSearch] Searching for: "${searchQuery}" (Limit: ${count})`);
        const images = await this.imageSearch.search(searchQuery, count);
        
        if (images.length === 0) {
            throw new Error("No images found for query.");
        }

        // 2. Chunk images and Generate Sprites
        const chunks: SerperImage[][] = [];
        for (let i = 0; i < images.length; i += this.imagesPerSprite) {
            chunks.push(images.slice(i, i + this.imagesPerSprite));
        }

        console.log(`[AiImageSearch] Generating ${chunks.length} sprite(s) from ${images.length} images...`);

        const spritePromises = chunks.map(async (chunk, i) => {
            const startNum = (i * this.imagesPerSprite) + 1;
            const urls = chunk.map(img => img.imageUrl);
            try {
                const result = await SpriteGenerator.generate(urls, startNum);
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

        // 3. Prepare LLM Request
        const contentParts: any[] = [
            { type: 'text', text: `Search Query used: "${searchQuery}"\n\nSelection Criteria: ${selectionPrompt}\n\nReturn the index numbers (displayed in the top-left of the images) of the best matches. Select at most ${maxSelected} image(s).` }
        ];

        // Map visual index -> SerperImage
        const indexMap = new Map<number, SerperImage>();

        for (const sprite of sprites) {
            const base64Sprite = sprite.spriteBuffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64Sprite}`;
            
            contentParts.push({ type: 'image_url', image_url: { url: dataUrl } });

            // Map valid indices back to original images
            sprite.validIndices.forEach((originalIndexInChunk, i) => {
                const visualIndex = sprite.startNum + i;
                indexMap.set(visualIndex, sprite.chunk[originalIndexInChunk]);
            });
        }

        const SelectionSchema = z.object({
            selected_indices: z.array(z.number()).describe(`The numbers visible on the selected images (1-based). Select up to ${maxSelected} indices.`),
            reasoning: z.string().describe("Why these images were selected based on the prompt")
        });

        const messages = [
            {
                role: 'system' as const,
                content: "You are an expert image curator. You will be presented with one or more grids of numbered images. Your job is to select the best image(s) based strictly on the user's criteria."
            },
            {
                role: 'user' as const,
                content: contentParts
            }
        ];

        // 4. Call LLM
        console.log(`[AiImageSearch] Asking AI to select up to ${maxSelected} images...`);
        const response = await this.llm.promptZod(messages, SelectionSchema);

        console.log(`[AiImageSearch] AI Selected: ${response.selected_indices.join(', ')}. Reason: ${response.reasoning}`);

        // 5. Map back to original images
        const selectedImages: SerperImage[] = [];
        
        // Take only up to maxSelected, just in case LLM returns more
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
}
