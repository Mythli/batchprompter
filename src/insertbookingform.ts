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

interface DetectionOptions {
    targetColor: string;
    threshold: number;
    margins: Margins;
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

function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function normalizeFormData(data: BookingFormData): BookingFormData {
    return {
        header: {
            title: escapeXml(data.header.title),
            subtitle: escapeXml(data.header.subtitle),
            details: data.header.details.map(escapeXml)
        },
        stepper: {
            step1: escapeXml(data.stepper.step1),
            step2: escapeXml(data.stepper.step2),
            step3: escapeXml(data.stepper.step3)
        },
        inputs: data.inputs.map(input => ({
            label: escapeXml(input.label),
            value: escapeXml(input.value)
        })),
        footer: {
            backText: escapeXml(data.footer.backText),
            nextText: escapeXml(data.footer.nextText)
        }
    };
}

function createDebugSvg(
    width: number,
    height: number,
    grid: boolean[][],
    blockSize: number,
    foundRect: Rectangle
): string {
    const elements: string[] = [];

    // Draw grid blocks
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
            const x = c * blockSize;
            const y = r * blockSize;
            // Green for match, Red for no match. Semi-transparent.
            const color = grid[r][c] ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
            elements.push(`<rect x="${x}" y="${y}" width="${blockSize}" height="${blockSize}" fill="${color}" />`);
        }
    }

    // Draw found rectangle outline in Green
    elements.push(`<rect x="${foundRect.x}" y="${foundRect.y}" width="${foundRect.width}" height="${foundRect.height}" fill="none" stroke="#00FF00" stroke-width="4" />`);

    return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${elements.join('\n')}
    </svg>
    `;
}

async function detectScreenArea(
    inputPath: string,
    options: DetectionOptions,
    debugOutputPath?: string
): Promise<Rectangle> {
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

    const blockSize = 10;
    const rows = Math.ceil(height / blockSize);
    const cols = Math.ceil(width / blockSize);
    const grid: boolean[][] = Array(rows).fill(null).map(() => Array(cols).fill(false));

    // Parse target color
    const hex = options.targetColor.replace(/^#/, '');
    const targetR = parseInt(hex.substring(0, 2), 16);
    const targetG = parseInt(hex.substring(2, 4), 16);
    const targetB = parseInt(hex.substring(4, 6), 16);

    const thresholdSq = options.threshold * options.threshold;

    // 2. Build Grid
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let matchCount = 0;
            let totalCount = 0;

            const startY = r * blockSize;
            const startX = c * blockSize;
            const endY = Math.min(startY + blockSize, height);
            const endX = Math.min(startX + blockSize, width);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    totalCount++;
                    const offset = (y * width + x) * 4;
                    const red = data[offset];
                    const green = data[offset + 1];
                    const blue = data[offset + 2];

                    const distSq = Math.pow(red - targetR, 2) +
                                   Math.pow(green - targetG, 2) +
                                   Math.pow(blue - targetB, 2);

                    if (distSq <= thresholdSq) {
                        matchCount++;
                    }
                }
            }

            // If > 90% pixels match, consider the block a match
            if (totalCount > 0 && (matchCount / totalCount) > 0.9) {
                grid[r][c] = true;
            }
        }
    }

    // 3. Find Largest Rectangle of 1s in the grid
    const heights = new Int32Array(cols).fill(0);
    let maxArea = 0;
    let bestRectGrid = { c: 0, r: 0, w: 0, h: 0 };

    for (let r = 0; r < rows; r++) {
        // Update heights
        for (let c = 0; c < cols; c++) {
            if (grid[r][c]) {
                heights[c]++;
            } else {
                heights[c] = 0;
            }
        }

        // Largest rectangle in histogram
        const stack: number[] = [];
        for (let c = 0; c <= cols; c++) {
            const h = (c === cols) ? 0 : heights[c];
            while (stack.length > 0 && h < heights[stack[stack.length - 1]]) {
                const heightVal = heights[stack.pop()!];
                const widthVal = stack.length === 0 ? c : c - stack[stack.length - 1] - 1;
                const area = heightVal * widthVal;

                if (area > maxArea) {
                    maxArea = area;
                    // Top-left corner of this rectangle
                    // Bottom row is r. Height is heightVal. Top row is r - heightVal + 1.
                    // Right col is c - 1. Width is widthVal. Left col is c - widthVal.
                    bestRectGrid = {
                        c: c - widthVal,
                        r: r - heightVal + 1,
                        w: widthVal,
                        h: heightVal
                    };
                }
            }
            stack.push(c);
        }
    }

    if (maxArea === 0) {
        throw new Error('No matching screen area found.');
    }

    const rawRect = {
        x: bestRectGrid.c * blockSize,
        y: bestRectGrid.r * blockSize,
        width: bestRectGrid.w * blockSize,
        height: bestRectGrid.h * blockSize
    };

    // 3.5 Expand rectangle pixel by pixel
    let expanded = true;
    while (expanded) {
        expanded = false;

        // Try Top
        if (rawRect.y > 0) {
            const testY = rawRect.y - 1;
            let matchCount = 0;
            for (let x = rawRect.x; x < rawRect.x + rawRect.width; x++) {
                const offset = (testY * width + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const distSq = Math.pow(r - targetR, 2) + Math.pow(g - targetG, 2) + Math.pow(b - targetB, 2);
                if (distSq <= thresholdSq) matchCount++;
            }
            if (matchCount / rawRect.width > 0.9) {
                rawRect.y--;
                rawRect.height++;
                expanded = true;
            }
        }

        // Try Bottom
        if (rawRect.y + rawRect.height < height) {
            const testY = rawRect.y + rawRect.height;
            let matchCount = 0;
            for (let x = rawRect.x; x < rawRect.x + rawRect.width; x++) {
                const offset = (testY * width + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const distSq = Math.pow(r - targetR, 2) + Math.pow(g - targetG, 2) + Math.pow(b - targetB, 2);
                if (distSq <= thresholdSq) matchCount++;
            }
            if (matchCount / rawRect.width > 0.9) {
                rawRect.height++;
                expanded = true;
            }
        }

        // Try Left
        if (rawRect.x > 0) {
            const testX = rawRect.x - 1;
            let matchCount = 0;
            for (let y = rawRect.y; y < rawRect.y + rawRect.height; y++) {
                const offset = (y * width + testX) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const distSq = Math.pow(r - targetR, 2) + Math.pow(g - targetG, 2) + Math.pow(b - targetB, 2);
                if (distSq <= thresholdSq) matchCount++;
            }
            if (matchCount / rawRect.height > 0.9) {
                rawRect.x--;
                rawRect.width++;
                expanded = true;
            }
        }

        // Try Right
        if (rawRect.x + rawRect.width < width) {
            const testX = rawRect.x + rawRect.width;
            let matchCount = 0;
            for (let y = rawRect.y; y < rawRect.y + rawRect.height; y++) {
                const offset = (y * width + testX) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const distSq = Math.pow(r - targetR, 2) + Math.pow(g - targetG, 2) + Math.pow(b - targetB, 2);
                if (distSq <= thresholdSq) matchCount++;
            }
            if (matchCount / rawRect.height > 0.9) {
                rawRect.width++;
                expanded = true;
            }
        }
    }

    // 4. Generate Debug Image if requested
    if (debugOutputPath) {
        const svg = createDebugSvg(width, height, grid, blockSize, rawRect);
        await sharp(inputPath)
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .toFile(debugOutputPath);
        console.log(`Debug image saved to ${debugOutputPath}`);
    }

    // 5. Apply Margins
    const marginXLeft = rawRect.width * options.margins.left;
    const marginXRight = rawRect.width * options.margins.right;
    const marginTop = rawRect.height * options.margins.top;
    const marginBottom = rawRect.height * options.margins.bottom;

    const finalX = rawRect.x + marginXLeft;
    const finalY = rawRect.y + marginTop;
    const finalWidth = rawRect.width - (marginXLeft + marginXRight);
    const finalHeight = rawRect.height - (marginTop + marginBottom);

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

        // Draw green border around the detected area (changed from red)
        const borderW = this.s(4);
        this.elements.push(`<rect x="${borderW/2}" y="${borderW/2}" width="${this.width - borderW}" height="${this.height - borderW}" fill="none" stroke="#00FF00" stroke-width="${borderW}" />`);
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

    // Derive debug output path
    const ext = path.extname(outputPath);
    const base = path.basename(outputPath, ext);
    const dir = path.dirname(outputPath);
    const debugOutputPath = path.join(dir, `${base}_debug${ext}`);

    try {
        // Load JSON data
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        const rawFormData: BookingFormData = JSON.parse(jsonContent);

        // Normalize data (escape XML characters)
        const formData = normalizeFormData(rawFormData);

        // Configuration
        const detectionOptions: DetectionOptions = {
            targetColor: '#E4E7EF',
            threshold: 45, // Allow for some lighting variation
            margins: {
                top: 0.01,
                right: 0.01,
                bottom: 0.00,
                left: 0.01
            }
        };

        const rect = await detectScreenArea(inputPath, detectionOptions, debugOutputPath);
        console.log(`Detected area: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);

        await drawBookingForm(inputPath, outputPath, rect, formData, logoPath);

    } catch (error) {
        console.error('Error processing image:', error);
    }
}

main();
