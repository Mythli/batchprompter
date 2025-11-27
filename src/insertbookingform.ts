import sharp from 'sharp';

async function detectAndDraw() {
    const inputPath = 'test/input.png';
    const outputPath = 'test/output_with_rect.png';

    try {
        // 1. Analyze image
        const image = sharp(inputPath);
        const metadata = await image.metadata();
        
        if (!metadata.width || !metadata.height) {
            throw new Error('Unable to retrieve image metadata');
        }

        const { width, height } = metadata;

        // Get raw pixel data. 
        // We use a clone for analysis so we don't affect the original instance state (though we create a new one for output anyway).
        const { data, info } = await image
            .clone()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const visited = new Uint8Array(width * height); // 0 = unvisited, 1 = visited
        const components: { x: number, y: number, w: number, h: number, size: number }[] = [];

        const isScreenPixel = (x: number, y: number) => {
            const offset = (y * width + x) * 4;
            const r = data[offset];
            const g = data[offset + 1];
            const b = data[offset + 2];

            // Brightness
            const brightness = (r + g + b) / 3;
            // Saturation
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const saturation = maxC - minC;

            // Thresholds: 
            // Screen is light (brightness > 200) 
            // Screen is neutral color (saturation < 30)
            return brightness > 200 && saturation < 30;
        };

        // Find connected components using flood fill
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (visited[idx]) continue;
                
                if (isScreenPixel(x, y)) {
                    // Start flood fill (DFS)
                    let minX = x, maxX = x, minY = y, maxY = y;
                    let count = 0;
                    const stack = [idx];
                    visited[idx] = 1;

                    while (stack.length > 0) {
                        const currIdx = stack.pop()!;
                        const currX = currIdx % width;
                        const currY = Math.floor(currIdx / width);

                        count++;
                        if (currX < minX) minX = currX;
                        if (currX > maxX) maxX = currX;
                        if (currY < minY) minY = currY;
                        if (currY > maxY) maxY = currY;

                        // Check neighbors (4-connectivity)
                        const neighbors = [
                            { nx: currX + 1, ny: currY },
                            { nx: currX - 1, ny: currY },
                            { nx: currX, ny: currY + 1 },
                            { nx: currX, ny: currY - 1 }
                        ];

                        for (const { nx, ny } of neighbors) {
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                const nIdx = ny * width + nx;
                                if (!visited[nIdx] && isScreenPixel(nx, ny)) {
                                    visited[nIdx] = 1;
                                    stack.push(nIdx);
                                }
                            }
                        }
                    }

                    // Store component if it's significant (ignore small noise)
                    if (count > 1000) { 
                        components.push({
                            x: minX,
                            y: minY,
                            w: maxX - minX,
                            h: maxY - minY,
                            size: count
                        });
                    }
                }
            }
        }

        if (components.length === 0) {
            console.log('No screen area detected based on thresholds.');
            return;
        }

        // Heuristic: The screen is likely the component closest to the center of the image
        // that is also reasonably large.
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Calculate a score for each component: size / distance_from_center
        // We want to maximize size and minimize distance.
        const bestComponent = components.reduce((best, curr) => {
            const currCx = curr.x + curr.w / 2;
            const currCy = curr.y + curr.h / 2;
            const dist = Math.sqrt(Math.pow(currCx - centerX, 2) + Math.pow(currCy - centerY, 2));
            
            // Weight size more heavily than distance to avoid picking small central noise
            // Score = size / (distance + 1)
            const score = curr.size / (dist + 1);
            
            if (!best || score > best.score) {
                return { comp: curr, score };
            }
            return best;
        }, { comp: components[0], score: -1 }).comp;

        const { x: rectX, y: rectY, w: rectWidth, h: rectHeight } = bestComponent;

        console.log(`Detected area: x=${rectX}, y=${rectY}, w=${rectWidth}, h=${rectHeight}`);

        // Adjust rectangle: 4% margin on sides/bottom, larger margin on top for camera
        const marginX = rectWidth * 0.04;
        const marginBottom = rectHeight * 0.04;
        const marginTop = rectHeight * 0.07; // Extra space for camera

        const finalX = rectX + marginX;
        const finalY = rectY + marginTop;
        const finalWidth = rectWidth - (2 * marginX);
        const finalHeight = rectHeight - (marginTop + marginBottom);

        // Create an SVG rectangle to overlay
        const svgRect = `
            <svg width="${width}" height="${height}">
                <rect x="${finalX}" y="${finalY}" width="${finalWidth}" height="${finalHeight}" 
                      fill="none" stroke="red" stroke-width="2" />
            </svg>
        `;

        // 2. Output image
        // Create a fresh sharp instance for the output to avoid conflicting with the 'raw' state of the analysis instance
        await sharp(inputPath)
            .composite([{ input: Buffer.from(svgRect), top: 0, left: 0 }])
            .toFile(outputPath);

        console.log(`Processed image saved to ${outputPath}`);

    } catch (error) {
        console.error('Error processing image:', error);
    }
}

detectAndDraw();
