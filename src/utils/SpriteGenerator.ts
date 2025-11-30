import sharp from 'sharp';

export interface SpriteItem {
    buffer: Buffer;
    originalIndex: number;
}

export class SpriteGenerator {
    private static CELL_SIZE = 256;
    private static BORDER_WIDTH = 5;
    private static FONT_SIZE = 48;

    /**
     * Downloads images from URLs, processes them, and creates a labeled sprite.
     * Returns the sprite buffer and a map of sprite-index to original-array-index.
     */
    static async generate(imageUrls: string[]): Promise<{ spriteBuffer: Buffer; validIndices: number[] }> {
        // 1. Download and validate images
        const downloadPromises = imageUrls.map(async (url, index) => {
            try {
                const response = await fetch(url);
                if (!response.ok) return null;
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Verify it's a valid image by attempting to get metadata
                await sharp(buffer).metadata();
                
                return { buffer, originalIndex: index };
            } catch (e) {
                return null;
            }
        });

        const results = await Promise.all(downloadPromises);
        const validImages = results.filter((item): item is SpriteItem => item !== null);

        if (validImages.length === 0) {
            throw new Error("No valid images could be downloaded to generate a sprite.");
        }

        // 2. Calculate Grid Dimensions
        const count = validImages.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        
        const cellTotalSize = this.CELL_SIZE + (this.BORDER_WIDTH * 2);
        const spriteWidth = cols * cellTotalSize;
        const spriteHeight = rows * cellTotalSize;

        // 3. Process each image (Resize, Border, Number)
        const compositeOperations = await Promise.all(validImages.map(async (item, i) => {
            const displayIndex = i + 1; // 1-based index for the AI
            
            // Resize and cover
            const resized = await sharp(item.buffer)
                .resize(this.CELL_SIZE, this.CELL_SIZE, { fit: 'cover' })
                .toBuffer();

            // Create Red Border
            const bordered = await sharp(resized)
                .extend({
                    top: this.BORDER_WIDTH,
                    bottom: this.BORDER_WIDTH,
                    left: this.BORDER_WIDTH,
                    right: this.BORDER_WIDTH,
                    background: { r: 255, g: 0, b: 0, alpha: 1 }
                })
                .toBuffer();

            // Create Number Overlay (SVG)
            const svgNumber = `
                <svg width="${cellTotalSize}" height="${cellTotalSize}">
                    <style>
                        .number { fill: white; stroke: black; stroke-width: 3px; font-size: ${this.FONT_SIZE}px; font-weight: bold; font-family: sans-serif; }
                    </style>
                    <text x="10" y="${this.FONT_SIZE + 5}" class="number">${displayIndex}</text>
                </svg>
            `;

            const finalCell = await sharp(bordered)
                .composite([{ input: Buffer.from(svgNumber), top: 0, left: 0 }])
                .toBuffer();

            // Calculate position
            const col = i % cols;
            const row = Math.floor(i / cols);
            
            return {
                input: finalCell,
                top: row * cellTotalSize,
                left: col * cellTotalSize
            };
        }));

        // 4. Create final sprite
        const spriteBuffer = await sharp({
            create: {
                width: spriteWidth,
                height: spriteHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 1 } // Black background
            }
        })
        .composite(compositeOperations)
        .jpeg()
        .toBuffer();

        return {
            spriteBuffer,
            validIndices: validImages.map(v => v.originalIndex)
        };
    }
}
