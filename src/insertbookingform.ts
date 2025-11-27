import sharp from 'sharp';

interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Margins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

async function detectScreenArea(inputPath: string, margins: Margins = { top: 0, right: 0, bottom: 0, left: 0 }): Promise<Rectangle> {
    // 1. Analyze image
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
        throw new Error('Unable to retrieve image metadata');
    }

    const { width, height } = metadata;

    // Get raw pixel data. 
    const { data } = await image
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
        throw new Error('No screen area detected based on thresholds.');
    }

    // Heuristic: The screen is likely the component closest to the center of the image
    // that is also reasonably large.
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Calculate a score for each component: size / distance_from_center
    const bestComponent = components.reduce((best, curr) => {
        const currCx = curr.x + curr.w / 2;
        const currCy = curr.y + curr.h / 2;
        const dist = Math.sqrt(Math.pow(currCx - centerX, 2) + Math.pow(currCy - centerY, 2));
        
        const score = curr.size / (dist + 1);
        
        if (!best || score > best.score) {
            return { comp: curr, score };
        }
        return best;
    }, { comp: components[0], score: -1 }).comp;

    const { x: rectX, y: rectY, w: rectWidth, h: rectHeight } = bestComponent;

    // Apply margins
    const marginXLeft = rectWidth * margins.left;
    const marginXRight = rectWidth * margins.right;
    const marginTop = rectHeight * margins.top;
    const marginBottom = rectHeight * margins.bottom;

    const finalX = rectX + marginXLeft;
    const finalY = rectY + marginTop;
    const finalWidth = rectWidth - (marginXLeft + marginXRight);
    const finalHeight = rectHeight - (marginTop + marginBottom);

    return {
        x: finalX,
        y: finalY,
        width: finalWidth,
        height: finalHeight
    };
}

class BookingFormDrawer {
    private width: number;
    private height: number;
    private elements: string[] = [];
    private scale: number;
    private logoData?: { base64: string, width: number, height: number };

    constructor(width: number, height: number, logoData?: { base64: string, width: number, height: number }) {
        this.width = width;
        this.height = height;
        // Base scale on a reference width of ~375px (typical mobile width)
        this.scale = width / 375;
        this.logoData = logoData;
    }

    // Helper to scale values
    private s(val: number): number {
        return val * this.scale;
    }

    drawHeader() {
        const y = this.s(30);
        
        if (this.logoData) {
            const targetHeight = this.s(28);
            const aspectRatio = this.logoData.width / this.logoData.height;
            const targetWidth = targetHeight * aspectRatio;
            
            this.elements.push(`<image href="${this.logoData.base64}" x="${this.s(20)}" y="${y}" width="${targetWidth}" height="${targetHeight}" />`);
        } else {
            // Fallback text if logo not loaded
            this.elements.push(`<text x="${this.s(20)}" y="${y + this.s(19)}" font-family="Arial, sans-serif" font-weight="bold" font-size="${this.s(22)}" fill="#333">Butlerapp</text>`);
        }

        // Hamburger Menu
        const menuX = this.width - this.s(40);
        const menuY = y + this.s(4);
        const barH = this.s(3);
        const barW = this.s(20);
        const gap = this.s(6);
        
        this.elements.push(`<rect x="${menuX}" y="${menuY}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(1.5)}" />`);
        this.elements.push(`<rect x="${menuX}" y="${menuY + gap + barH}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(1.5)}" />`);
        this.elements.push(`<rect x="${menuX}" y="${menuY + (gap + barH) * 2}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(1.5)}" />`);
    }

    drawStepper(y: number) {
        const startX = this.s(20);
        const circleSize = this.s(24);
        const fontSize = this.s(12);
        
        // Step 1 (Active)
        this.elements.push(`<circle cx="${startX + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#1D1D1F" />`);
        this.elements.push(`<text x="${startX + circleSize/2}" y="${y + circleSize/2 + this.s(4)}" text-anchor="middle" fill="white" font-size="${fontSize}" font-family="Arial" font-weight="bold">1</text>`);
        
        // Text
        this.elements.push(`<text x="${startX + circleSize + this.s(10)}" y="${y + circleSize/2 + this.s(4)}" fill="#1D1D1F" font-size="${fontSize}" font-weight="bold" font-family="Arial">Kurstermin auswählen</text>`);

        // Step 3 (Inactive) - Right aligned
        const step3X = this.width - this.s(20) - circleSize;
        this.elements.push(`<circle cx="${step3X + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#E5E5EA" />`);
        this.elements.push(`<text x="${step3X + circleSize/2}" y="${y + circleSize/2 + this.s(4)}" text-anchor="middle" fill="#8E8E93" font-size="${fontSize}" font-family="Arial">3</text>`);

        // Step 2 (Inactive) - Left of Step 3
        const gap = this.s(8);
        const step2X = step3X - gap - circleSize;
        this.elements.push(`<circle cx="${step2X + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#E5E5EA" />`);
        this.elements.push(`<text x="${step2X + circleSize/2}" y="${y + circleSize/2 + this.s(4)}" text-anchor="middle" fill="#8E8E93" font-size="${fontSize}" font-family="Arial">2</text>`);
    }

    drawInfoSection(y: number) {
        const x = this.s(20);
        const lineHeight = this.s(26);
        
        // Title
        this.elements.push(`<text x="${x}" y="${y}" font-family="Arial" font-weight="bold" font-size="${this.s(20)}" fill="#000">Reanimationskurs</text>`);
        this.elements.push(`<text x="${x}" y="${y + lineHeight}" font-family="Arial" font-weight="bold" font-size="${this.s(20)}" fill="#000">(9 UE) 59,00 €</text>`);

        // Details
        const detailY = y + lineHeight * 2 + this.s(10);
        const detailLineHeight = this.s(18);
        this.elements.push(`<text x="${x}" y="${detailY}" font-family="Arial" font-size="${this.s(14)}" fill="#333">Ort: DRK Zentrum Berlin</text>`);
        this.elements.push(`<text x="${x}" y="${detailY + detailLineHeight}" font-family="Arial" font-size="${this.s(14)}" fill="#333">Zeit: 09:00 - 16:30 Uhr</text>`);
    }

    drawInput(y: number, label: string, value: string) {
        const x = this.s(20);
        const w = this.width - this.s(40);
        const h = this.s(44);
        const radius = this.s(6);

        // Label
        this.elements.push(`<text x="${x}" y="${y}" font-family="Arial" font-size="${this.s(12)}" fill="#333">${label}</text>`);

        // Input Box
        const boxY = y + this.s(8);
        this.elements.push(`<rect x="${x}" y="${boxY}" width="${w}" height="${h}" rx="${radius}" fill="#F2F2F7" />`);

        // Value
        this.elements.push(`<text x="${x + this.s(12)}" y="${boxY + h/2 + this.s(5)}" font-family="Arial" font-size="${this.s(14)}" fill="#000">${value}</text>`);

        // Chevron Icon
        const iconSize = this.s(10);
        const iconX = x + w - this.s(24);
        const iconY = boxY + h/2 - iconSize/2;
        this.elements.push(`<path d="M${iconX} ${iconY} L${iconX + iconSize/2} ${iconY + iconSize/2} L${iconX + iconSize} ${iconY}" fill="none" stroke="#999" stroke-width="${this.s(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    drawFooter() {
        const y = this.height - this.s(30);
        const xLeft = this.s(20);
        const xRight = this.width - this.s(20);

        // Back
        this.elements.push(`<text x="${xLeft}" y="${y}" font-family="Arial" font-size="${this.s(14)}" fill="#8E8E93">← Zurück</text>`);

        // Next
        // Redoing "Weiter" to include icon
        const iconR = this.s(8);
        const iconCx = xRight - iconR;
        const iconCy = y - this.s(4);
        
        // Draw text
        this.elements.push(`<text x="${iconCx - iconR - this.s(5)}" y="${y}" text-anchor="end" font-family="Arial" font-weight="bold" font-size="${this.s(14)}" fill="#000">Weiter</text>`);
        
        // Draw Icon
        this.elements.push(`<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="none" stroke="#000" stroke-width="${this.s(1.5)}" />`);
        this.elements.push(`<path d="M${iconCx - this.s(2)} ${iconCy} L${iconCx + this.s(2)} ${iconCy} M${iconCx} ${iconCy - this.s(2)} L${iconCx + this.s(2)} ${iconCy} L${iconCx} ${iconCy + this.s(2)}" fill="none" stroke="#000" stroke-width="${this.s(1.5)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    render() {
        this.drawHeader();
        this.drawStepper(this.s(80));
        this.drawInfoSection(this.s(140));
        
        let inputY = this.s(250);
        const inputGap = this.s(70);
        
        this.drawInput(inputY, "Kurstermin*", "15. Nov. 2025");
        this.drawInput(inputY + inputGap, "Teilnehmeranzahl*", "1 Person");
        this.drawInput(inputY + inputGap * 2, "Tarifwahl*", "59,00 € Führerschein-Paket");
        
        this.drawFooter();
    }

    getSvg(): string {
        return `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
            ${this.elements.join('\n')}
        </svg>
        `;
    }
}

async function drawBookingForm(inputPath: string, outputPath: string, rect: Rectangle) {
    // Load logo
    let logoData;
    try {
        const logoPath = 'test/logo.png';
        const logoImage = sharp(logoPath);
        const metadata = await logoImage.metadata();
        const buffer = await logoImage.toBuffer();
        if (metadata.width && metadata.height) {
            logoData = {
                base64: `data:image/png;base64,${buffer.toString('base64')}`,
                width: metadata.width,
                height: metadata.height
            };
        }
    } catch (error) {
        console.warn("Failed to load logo image:", error);
    }

    const drawer = new BookingFormDrawer(rect.width, rect.height, logoData);
    drawer.render();
    const svgContent = drawer.getSvg();

    const image = sharp(inputPath);
    
    // Composite the SVG onto the image
    await image
        .composite([{ 
            input: Buffer.from(svgContent), 
            top: Math.round(rect.y), 
            left: Math.round(rect.x) 
        }])
        .toFile(outputPath);

    console.log(`Processed image saved to ${outputPath}`);
}

async function main() {
    const inputPath = 'test/input.png';
    const outputPath = 'test/output_with_form.png';

    try {
        // Margins: 4% sides/bottom, 7% top
        const margins: Margins = {
            top: 0.07,
            right: 0.04,
            bottom: 0.04,
            left: 0.04
        };

        const rect = await detectScreenArea(inputPath, margins);
        console.log(`Detected area: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
        
        await drawBookingForm(inputPath, outputPath, rect);

    } catch (error) {
        console.error('Error processing image:', error);
    }
}

main();
