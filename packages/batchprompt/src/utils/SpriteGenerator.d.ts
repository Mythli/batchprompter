export interface SpriteItem {
    buffer: Buffer;
    originalIndex: number;
}
export declare class SpriteGenerator {
    private static CELL_SIZE;
    private static BORDER_WIDTH;
    private static FONT_SIZE;
    /**
     * Processes provided image buffers and creates a labeled sprite.
     * Returns the sprite buffer and a map of sprite-index to original-array-index.
     *
     * @param images List of objects containing image buffers
     * @param startNumber The starting number for the overlay labels (default 1)
     */
    static generate(images: {
        buffer: Buffer;
    }[], startNumber?: number): Promise<{
        spriteBuffer: Buffer;
        validIndices: number[];
    }>;
}
//# sourceMappingURL=SpriteGenerator.d.ts.map