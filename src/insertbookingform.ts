import sharp from 'sharp';

async function detectAndDraw() {
    const inputPath = 'test/input.png';
    const outputPath = 'test/output_with_rect.png';

    try {
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        
        if (!metadata.width || !metadata.height) {
            throw new Error('Unable to retrieve image metadata');
        }

        const { width, height } = metadata;

        // Get raw pixel data to analyze
        const { data, info } = await image
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let detectedPixels = 0;

        // Iterate over pixels to find the grey screen area
        // Heuristic: The screen is likely the largest bright, low-saturation area
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4; // 4 channels (RGBA)
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];

                // Calculate brightness and saturation approximation
                const brightness = (r + g + b) / 3;
                const maxC = Math.max(r, g, b);
                const minC = Math.min(r, g, b);
                const saturation = maxC - minC;

                // Thresholds: 
                // Screen is light (brightness > 200) 
                // Screen is neutral color (saturation < 30)
                // These values might need tuning based on the specific image lighting
                if (brightness > 215 && saturation < 25) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    detectedPixels++;
                }
            }
        }

        if (detectedPixels === 0) {
            console.log('No screen area detected based on thresholds.');
            return;
        }

        const rectX = minX;
        const rectY = minY;
        const rectWidth = maxX - minX;
        const rectHeight = maxY - minY;

        console.log(`Detected area: x=${rectX}, y=${rectY}, w=${rectWidth}, h=${rectHeight}`);

        // Create an SVG rectangle to overlay
        const svgRect = `
            <svg width="${width}" height="${height}">
                <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" 
                      fill="none" stroke="red" stroke-width="10" />
            </svg>
        `;

        // Composite the rectangle onto the original image
        await image
            .composite([{ input: Buffer.from(svgRect), top: 0, left: 0 }])
            .toFile(outputPath);

        console.log(`Processed image saved to ${outputPath}`);

    } catch (error) {
        console.error('Error processing image:', error);
    }
}

detectAndDraw();
