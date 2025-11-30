import { z } from 'zod';
import { LlmClient } from 'llm-fns';
import { ImageSearch, SerperImage } from './ImageSearch.js';
import { SpriteGenerator } from './SpriteGenerator.js';

export class AiImageSearch {
    constructor(
        private imageSearch: ImageSearch,
        private llm: LlmClient,
        private model: string = 'gpt-4o' // Default to a vision-capable model
    ) {}

    /**
     * Searches for images, creates a sprite, and asks the AI to select the best one(s).
     * 
     * @param searchQuery The query to send to the search engine (e.g. "sailing boat")
     * @param selectionPrompt The criteria for the AI (e.g. "Select the image that looks most heroic")
     * @param count Number of images to fetch and present (default 9)
     * @returns The selected SerperImage object(s)
     */
    async searchAndSelect(
        searchQuery: string, 
        selectionPrompt: string, 
        count: number = 9
    ): Promise<SerperImage[]> {
        // 1. Search
        console.log(`[AiImageSearch] Searching for: "${searchQuery}"`);
        const images = await this.imageSearch.search(searchQuery, count);
        
        if (images.length === 0) {
            throw new Error("No images found for query.");
        }

        const imageUrls = images.map(img => img.imageUrl);

        // 2. Generate Sprite
        console.log(`[AiImageSearch] Generating sprite from ${images.length} images...`);
        const { spriteBuffer, validIndices } = await SpriteGenerator.generate(imageUrls);
        
        // 3. Prepare LLM Request
        const base64Sprite = spriteBuffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64Sprite}`;

        const SelectionSchema = z.object({
            selected_indices: z.array(z.number()).describe("The numbers visible on the selected images (1-based)"),
            reasoning: z.string().describe("Why these images were selected based on the prompt")
        });

        const messages = [
            {
                role: 'system' as const,
                content: "You are an expert image curator. You will be presented with a grid of numbered images. Your job is to select the best image(s) based strictly on the user's criteria."
            },
            {
                role: 'user' as const,
                content: [
                    { type: 'text' as const, text: `Search Query used: "${searchQuery}"\n\nSelection Criteria: ${selectionPrompt}\n\nReturn the index numbers (displayed in the top-left of the images) of the best matches.` },
                    { type: 'image_url' as const, image_url: { url: dataUrl } }
                ]
            }
        ];

        // 4. Call LLM
        console.log(`[AiImageSearch] Asking AI to select...`);
        const response = await this.llm.promptZod(messages, SelectionSchema, {
            model: this.model
        });

        console.log(`[AiImageSearch] AI Selected: ${response.selected_indices.join(', ')}. Reason: ${response.reasoning}`);

        // 5. Map back to original images
        const selectedImages: SerperImage[] = [];
        
        for (const visualIndex of response.selected_indices) {
            // visualIndex is 1-based. 
            // The validIndices array maps 0-based visual array index -> original images index.
            const arrayIndex = visualIndex - 1;
            
            if (arrayIndex >= 0 && arrayIndex < validIndices.length) {
                const originalIndex = validIndices[arrayIndex];
                selectedImages.push(images[originalIndex]);
            }
        }

        return selectedImages;
    }
}
