import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

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

interface BookingFormData {
    header: {
        title: string;
        subtitle: string;
        details: string[];
    };
    stepper: {
        step1: string;
        step2: string;
        step3: string;
    };
    inputs: {
        label: string;
        value: string;
    }[];
    footer: {
        backText: string;
        nextText: string;
    };
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
    private formData: BookingFormData;

    constructor(width: number, height: number, formData: BookingFormData, logoData?: { base64: string, width: number, height: number }) {
        this.width = width;
        this.height = height;
        // Base scale on a reference width of ~375px (typical mobile width)
        this.scale = width / 375;
        this.logoData = logoData;
        this.formData = formData;
    }

    // Helper to scale values
    private s(val: number): number {
        return val * this.scale;
    }

    drawHeader() {
        const y = this.s(30);
        
        if (this.logoData) {
            const targetHeight = this.s(42); // Increased by 50%
            const aspectRatio = this.logoData.width / this.logoData.height;
            const targetWidth = targetHeight * aspectRatio;
            
            this.elements.push(`<image href="${this.logoData.base64}" x="${this.s(20)}" y="${y}" width="${targetWidth}" height="${targetHeight}" />`);
        } else {
            // Fallback text if logo not loaded
            this.elements.push(`<text x="${this.s(20)}" y="${y + this.s(19)}" font-family="Arial, sans-serif" font-weight="bold" font-size="${this.s(22)}" fill="#333">Butlerapp</text>`);
        }

        // Hamburger Menu
        // Increased size and thickness
        const barW = this.s(30); // 20 * 1.5
        const barH = this.s(5);  // Thicker
        const gap = this.s(9);   // 6 * 1.5
        
        const menuX = this.width - this.s(50); // Maintain ~20px right margin (20 + 30 = 50)
        
        // Center vertically with logo (Logo Y=30, H=42 -> Center=51)
        // Menu H = 3*5 + 2*9 = 33. Center offset = 16.5. Top = 51 - 16.5 = 34.5
        const menuY = this.s(34.5);
        
        this.elements.push(`<rect x="${menuX}" y="${menuY}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(2.5)}" />`);
        this.elements.push(`<rect x="${menuX}" y="${menuY + gap + barH}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(2.5)}" />`);
        this.elements.push(`<rect x="${menuX}" y="${menuY + (gap + barH) * 2}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(2.5)}" />`);
    }

    drawStepper(y: number) {
        const startX = this.s(20);
        // Increased size by ~30% (24 -> 32, 12 -> 16)
        const circleSize = this.s(32);
        const fontSize = this.s(16);
        const textOffsetY = this.s(6);
        
        // Step 1 (Active)
        this.elements.push(`<circle cx="${startX + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#1D1D1F" />`);
        this.elements.push(`<text x="${startX + circleSize/2}" y="${y + circleSize/2 + textOffsetY}" text-anchor="middle" fill="white" font-size="${fontSize}" font-family="Arial" font-weight="bold">1</text>`);
        
        // Text
        this.elements.push(`<text x="${startX + circleSize + this.s(10)}" y="${y + circleSize/2 + textOffsetY}" fill="#1D1D1F" font-size="${fontSize}" font-weight="bold" font-family="Arial">${this.formData.stepper.step1}</text>`);

        // Step 3 (Inactive) - Right aligned
        const step3X = this.width - this.s(20) - circleSize;
        // Darker text color for inactive: #444444
        this.elements.push(`<circle cx="${step3X + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#C7C7CC" />`);
        this.elements.push(`<text x="${step3X + circleSize/2}" y="${y + circleSize/2 + textOffsetY}" text-anchor="middle" fill="#444444" font-size="${fontSize}" font-family="Arial">3</text>`);

        // Step 2 (Inactive) - Left of Step 3
        const gap = this.s(16);
        const step2X = step3X - gap - circleSize;
        this.elements.push(`<circle cx="${step2X + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#C7C7CC" />`);
        this.elements.push(`<text x="${step2X + circleSize/2}" y="${y + circleSize/2 + textOffsetY}" text-anchor="middle" fill="#444444" font-size="${fontSize}" font-family="Arial">2</text>`);
    }

    drawInfoSection(y: number) {
        const x = this.s(20);
        const lineHeight = this.s(34);
        
        // Title
        this.elements.push(`<text x="${x}" y="${y}" font-family="Arial" font-weight="bold" font-size="${this.s(26)}" fill="#000">${this.formData.header.title}</text>`);
        // Subtitle - Increased font size to match title (26)
        this.elements.push(`<text x="${x}" y="${y + lineHeight}" font-family="Arial" font-weight="bold" font-size="${this.s(26)}" fill="#000">${this.formData.header.subtitle}</text>`);

        // Details
        const detailY = y + lineHeight * 2 + this.s(10);
        const detailLineHeight = this.s(18);
        
        this.formData.header.details.forEach((detail, index) => {
            this.elements.push(`<text x="${x}" y="${detailY + (index * detailLineHeight)}" font-family="Arial" font-size="${this.s(14)}" fill="#333">${detail}</text>`);
        });
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
        const y = this.height - this.s(35);
        const xLeft = this.s(20);
        const xRight = this.width - this.s(20);

        // Back
        this.elements.push(`<text x="${xLeft}" y="${y}" font-family="Arial" font-size="${this.s(16)}" fill="#8E8E93">← ${this.formData.footer.backText}</text>`);

        // Next
        const fontSize = this.s(22);
        const iconR = this.s(12);
        
        // Center icon vertically relative to text baseline approx
        // Baseline is y. Cap height ~0.7em. Center ~ y - 0.35em.
        const iconCy = y - (fontSize * 0.35);
        const iconCx = xRight - iconR;
        
        // Draw text
        this.elements.push(`<text x="${iconCx - iconR - this.s(10)}" y="${y}" text-anchor="end" font-family="Arial" font-weight="bold" font-size="${fontSize}" fill="#000">${this.formData.footer.nextText}</text>`);
        
        // Draw Icon Circle
        this.elements.push(`<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="none" stroke="#000" stroke-width="${this.s(2)}" />`);
        
        // Draw Arrow
        const arrowLen = this.s(10);
        const arrowHead = this.s(4);
        
        // Line
        this.elements.push(`<path d="M${iconCx - arrowLen/2} ${iconCy} L${iconCx + arrowLen/2} ${iconCy}" fill="none" stroke="#000" stroke-width="${this.s(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        // Head
        this.elements.push(`<path d="M${iconCx + arrowLen/2 - arrowHead} ${iconCy - arrowHead} L${iconCx + arrowLen/2} ${iconCy} L${iconCx + arrowLen/2 - arrowHead} ${iconCy + arrowHead}" fill="none" stroke="#000" stroke-width="${this.s(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    render() {
        this.drawHeader();
        this.drawStepper(this.s(100));
        this.drawInfoSection(this.s(180));
        
        let inputY = this.s(310);
        const inputGap = this.s(85);
        
        this.formData.inputs.forEach((input, index) => {
            this.drawInput(inputY + (inputGap * index), input.label, input.value);
        });
        
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

async function drawBookingForm(inputPath: string, outputPath: string, rect: Rectangle, formData: BookingFormData, logoPath: string) {
    // Load logo
    let logoData;
    try {
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
        console.warn(`Failed to load logo image from ${logoPath}:`, error);
    }

    const drawer = new BookingFormDrawer(rect.width, rect.height, formData, logoData);
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
    // Parse arguments
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error('Usage: ts-node src/insertbookingform.ts <input_image> <json_data> <logo_image> [output_image]');
        console.log('Example: ts-node src/insertbookingform.ts test/input.png test/form_data.json test/logo.png');
        process.exit(1);
    }

    const inputPath = args[0];
    const jsonPath = args[1];
    const logoPath = args[2];
    const outputPath = args[3] || 'test/output_with_form.png';

    try {
        // Load JSON data
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const formData: BookingFormData = JSON.parse(jsonContent);

        // Margins: 4% sides/bottom, 7% top
        const margins: Margins = {
            top: 0.07,
            right: 0.04,
            bottom: 0.04,
            left: 0.04
        };

        const rect = await detectScreenArea(inputPath, margins);
        console.log(`Detected area: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
        
        await drawBookingForm(inputPath, outputPath, rect, formData, logoPath);

    } catch (error) {
        console.error('Error processing image:', error);
    }
}

main();
