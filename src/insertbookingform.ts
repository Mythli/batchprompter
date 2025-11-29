import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';

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
    companyName: string;
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

interface ScalingOptions {
    general: number;
    stepper: number;
    header: number;
    content: number;
    footer: number;
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
        companyName: escapeXml(data.companyName),
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
    // if (debugOutputPath) {
    //     const svg = createDebugSvg(width, height, grid, blockSize, rawRect);
    //     await sharp(inputPath)
    //         .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    //         .toFile(debugOutputPath);
    //     console.log(`Debug image saved to ${debugOutputPath}`);
    // }

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
    private baseScale: number;
    private scalingOptions: ScalingOptions;
    private logoData?: { base64: string, width: number, height: number };
    private formData: BookingFormData;

    constructor(
        width: number, 
        height: number, 
        formData: BookingFormData, 
        logoData?: { base64: string, width: number, height: number },
        scalingOptions: ScalingOptions = { general: 1.0, stepper: 1.0, header: 1.0, content: 1.0, footer: 1.0 }
    ) {
        this.width = width;
        this.height = height;
        // Base scale on a reference width of ~375px (typical mobile width)
        this.baseScale = (width / 375) * scalingOptions.general;
        this.scalingOptions = scalingOptions;
        this.logoData = logoData;
        this.formData = formData;
    }

    // Helper to scale values with a specific section factor
    private s(val: number, sectionFactor: number = 1.0): number {
        return val * this.baseScale * sectionFactor;
    }

    // Helper to get consistent left margin based on general scale
    private getLeftMargin(): number {
        return this.s(20, 1.0); // Always use general scale (factor 1.0 relative to baseScale)
    }

    // Returns the height of the header section
    drawHeader(startY: number): number {
        const factor = this.scalingOptions.header;
        const y = startY;
        const x = this.getLeftMargin();

        if (this.logoData) {
            // Icon
            const targetHeight = this.s(32, factor);
            const aspectRatio = this.logoData.width / this.logoData.height;
            const targetWidth = targetHeight * aspectRatio;

            this.elements.push(`<image href="${this.logoData.base64}" x="${x}" y="${y}" width="${targetWidth}" height="${targetHeight}" />`);
            
            // Company Name Text
            const textX = x + targetWidth + this.s(10, factor);
            // Center text vertically relative to icon
            const fontSize = this.s(20, factor);
            const textY = y + (targetHeight / 2) + (fontSize * 0.35);
            
            this.elements.push(`<text x="${textX}" y="${textY}" font-family="Arial, sans-serif" font-weight="bold" font-size="${fontSize}" fill="#333">${this.formData.companyName}</text>`);
        } else {
            // Fallback text if logo not loaded
            this.elements.push(`<text x="${x}" y="${y + this.s(19, factor)}" font-family="Arial, sans-serif" font-weight="bold" font-size="${this.s(22, factor)}" fill="#333">${this.formData.companyName || 'Butlerapp'}</text>`);
        }

        // Hamburger Menu
        const barW = this.s(30, factor);
        const barH = this.s(5, factor);
        const gap = this.s(9, factor);

        // Right margin should also be consistent
        const menuX = this.width - this.s(50, 1.0); // Use general scale for positioning

        // Center vertically with logo (Logo Y=30, H=42 -> Center=51)
        // Menu H = 3*5 + 2*9 = 33. Center offset = 16.5. Top = 51 - 16.5 = 34.5
        // Adjusting relative to startY
        const menuY = y + this.s(4.5, factor); // 34.5 - 30 = 4.5 offset from top

        this.elements.push(`<rect x="${menuX}" y="${menuY}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(2.5, factor)}" />`);
        this.elements.push(`<rect x="${menuX}" y="${menuY + gap + barH}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(2.5, factor)}" />`);
        this.elements.push(`<rect x="${menuX}" y="${menuY + (gap + barH) * 2}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(2.5, factor)}" />`);

        // Return height used (approx 42 + padding)
        return this.s(60, factor); 
    }

    // Returns height of stepper section
    drawStepper(y: number): number {
        const factor = this.scalingOptions.stepper;
        const startX = this.getLeftMargin();
        const circleSize = this.s(32, factor);
        const fontSize = this.s(16, factor);
        const textOffsetY = this.s(6, factor);

        // Step 1 (Active)
        this.elements.push(`<circle cx="${startX + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#1D1D1F" />`);
        this.elements.push(`<text x="${startX + circleSize/2}" y="${y + circleSize/2 + textOffsetY}" text-anchor="middle" fill="white" font-size="${fontSize}" font-family="Arial" font-weight="bold">1</text>`);

        // Text
        this.elements.push(`<text x="${startX + circleSize + this.s(10, factor)}" y="${y + circleSize/2 + textOffsetY}" fill="#1D1D1F" font-size="${fontSize}" font-weight="bold" font-family="Arial">${this.formData.stepper.step1}</text>`);

        // Step 3 (Inactive) - Right aligned
        const step3X = this.width - this.getLeftMargin() - circleSize;
        // Darker text color for inactive: #444444
        this.elements.push(`<circle cx="${step3X + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#C7C7CC" />`);
        this.elements.push(`<text x="${step3X + circleSize/2}" y="${y + circleSize/2 + textOffsetY}" text-anchor="middle" fill="#444444" font-size="${fontSize}" font-family="Arial">3</text>`);

        // Step 2 (Inactive) - Left of Step 3
        const gap = this.s(16, factor);
        const step2X = step3X - gap - circleSize;
        this.elements.push(`<circle cx="${step2X + circleSize/2}" cy="${y + circleSize/2}" r="${circleSize/2}" fill="#C7C7CC" />`);
        this.elements.push(`<text x="${step2X + circleSize/2}" y="${y + circleSize/2 + textOffsetY}" text-anchor="middle" fill="#444444" font-size="${fontSize}" font-family="Arial">2</text>`);

        return circleSize + this.s(20, factor); // Height + padding
    }

    // Returns height of info section
    drawInfoSection(y: number): number {
        const factor = this.scalingOptions.header; // Using header scale for title/subtitle
        const x = this.getLeftMargin();
        const lineHeight = this.s(34, factor);

        // Title
        this.elements.push(`<text x="${x}" y="${y}" font-family="Arial" font-weight="bold" font-size="${this.s(26, factor)}" fill="#000">${this.formData.header.title}</text>`);
        // Subtitle
        this.elements.push(`<text x="${x}" y="${y + lineHeight}" font-family="Arial" font-weight="bold" font-size="${this.s(26, factor)}" fill="#000">${this.formData.header.subtitle}</text>`);

        // Details - Using content scale for details
        const contentFactor = this.scalingOptions.content;
        // Reduced gap before details (was 10)
        const detailY = y + lineHeight * 2 + this.s(2, contentFactor);
        const detailLineHeight = this.s(18, contentFactor);
        const detailX = this.getLeftMargin();

        this.formData.header.details.forEach((detail, index) => {
            this.elements.push(`<text x="${detailX}" y="${detailY + (index * detailLineHeight)}" font-family="Arial" font-size="${this.s(14, contentFactor)}" fill="#333">${detail}</text>`);
        });

        const detailsHeight = this.formData.header.details.length * detailLineHeight;
        // Reduced bottom padding (was 20)
        return (lineHeight * 2) + this.s(2, contentFactor) + detailsHeight + this.s(5, contentFactor); 
    }

    // Returns height of input
    drawInput(y: number, label: string, value: string): number {
        const factor = this.scalingOptions.content;
        const x = this.getLeftMargin();
        const w = this.width - (this.getLeftMargin() * 2); // Consistent width based on margins
        const h = this.s(44, factor);
        const radius = this.s(6, factor);

        // Label
        this.elements.push(`<text x="${x}" y="${y}" font-family="Arial" font-size="${this.s(12, factor)}" fill="#333">${label}</text>`);

        // Input Box
        const boxY = y + this.s(8, factor);
        this.elements.push(`<rect x="${x}" y="${boxY}" width="${w}" height="${h}" rx="${radius}" fill="#F2F2F7" />`);

        // Value
        this.elements.push(`<text x="${x + this.s(12, factor)}" y="${boxY + h/2 + this.s(5, factor)}" font-family="Arial" font-size="${this.s(14, factor)}" fill="#000">${value}</text>`);

        // Chevron Icon
        const iconSize = this.s(10, factor);
        const iconX = x + w - this.s(24, factor);
        const iconY = boxY + h/2 - iconSize/2;
        this.elements.push(`<path d="M${iconX} ${iconY} L${iconX + iconSize/2} ${iconY + iconSize/2} L${iconX + iconSize} ${iconY}" fill="none" stroke="#999" stroke-width="${this.s(2, factor)}" stroke-linecap="round" stroke-linejoin="round"/>`);

        return this.s(12, factor) + this.s(8, factor) + h + this.s(15, factor); // Label height + gap + box height + bottom margin
    }

    drawFooter() {
        const factor = this.scalingOptions.footer;
        const y = this.height - this.s(35, factor);
        const xLeft = this.getLeftMargin();
        const xRight = this.width - this.getLeftMargin();

        // Back
        this.elements.push(`<text x="${xLeft}" y="${y}" font-family="Arial" font-size="${this.s(16, factor)}" fill="#8E8E93">← ${this.formData.footer.backText}</text>`);

        // Next
        const fontSize = this.s(22, factor);
        const iconR = this.s(12, factor);

        // Center icon vertically relative to text baseline approx
        // Baseline is y. Cap height ~0.7em. Center ~ y - 0.35em.
        const iconCy = y - (fontSize * 0.35);
        const iconCx = xRight - iconR;

        // Draw text
        this.elements.push(`<text x="${iconCx - iconR - this.s(10, factor)}" y="${y}" text-anchor="end" font-family="Arial" font-weight="bold" font-size="${fontSize}" fill="#000">${this.formData.footer.nextText}</text>`);

        // Draw Icon Circle
        this.elements.push(`<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="none" stroke="#000" stroke-width="${this.s(2, factor)}" />`);

        // Draw Arrow
        const arrowLen = this.s(10, factor);
        const arrowHead = this.s(4, factor);

        // Line
        this.elements.push(`<path d="M${iconCx - arrowLen/2} ${iconCy} L${iconCx + arrowLen/2} ${iconCy}" fill="none" stroke="#000" stroke-width="${this.s(2, factor)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        // Head
        this.elements.push(`<path d="M${iconCx + arrowLen/2 - arrowHead} ${iconCy - arrowHead} L${iconCx + arrowLen/2} ${iconCy} L${iconCx + arrowLen/2 - arrowHead} ${iconCy + arrowHead}" fill="none" stroke="#000" stroke-width="${this.s(2, factor)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    render() {
        // Sequential layout calculation
        let currentY = this.s(30, this.scalingOptions.header); // Start Y for header

        const headerHeight = this.drawHeader(currentY);
        currentY += headerHeight + this.s(10, this.scalingOptions.general); // Add margin

        const stepperHeight = this.drawStepper(currentY);
        currentY += stepperHeight + this.s(20, this.scalingOptions.general); // Add margin

        const infoHeight = this.drawInfoSection(currentY);
        // Reduced margin after info section (was 20, now 10 to achieve ~50% gap reduction)
        currentY += infoHeight + this.s(10, this.scalingOptions.general); 

        // Draw inputs sequentially
        this.formData.inputs.forEach((input) => {
            const inputHeight = this.drawInput(currentY, input.label, input.value);
            currentY += inputHeight; // drawInput includes bottom margin
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

async function drawBookingForm(
    inputPath: string,
    outputPath: string,
    rect: Rectangle,
    formData: BookingFormData,
    logoPath: string,
    superSample: number = 8,
    scalingOptions: ScalingOptions
) {
    // Load logo
    let logoData;
    try {
        const logoImage = sharp(logoPath);
        const metadata = await logoImage.metadata();
        // Force PNG conversion for the logo data to ensure it renders correctly in the SVG
        const buffer = await logoImage.png().toBuffer();
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

    // Supersample to improve text rendering sharpness
    const drawer = new BookingFormDrawer(rect.width * superSample, rect.height * superSample, formData, logoData, scalingOptions);
    drawer.render();
    const svgContent = drawer.getSvg();

    // Render SVG at high resolution then downscale
    const svgBuffer = await sharp(Buffer.from(svgContent))
        .resize(Math.round(rect.width), Math.round(rect.height))
        .png()
        .toBuffer();

    const image = sharp(inputPath);

    // Composite the SVG onto the image
    await image
        .composite([{
            input: svgBuffer,
            top: Math.round(rect.y),
            left: Math.round(rect.x)
        }])
        .toFile(outputPath);

    console.log(`Processed image saved to ${outputPath}`);
}

async function main() {
    const program = new Command();

    program
        .name('insertbookingform')
        .description('Insert a booking form into an image')
        .argument('<input_image>', 'Path to the input image')
        .argument('<json_data>', 'Path to the JSON data file')
        .argument('<logo_image>', 'Path to the logo image')
        .argument('[output_image]', 'Path to the output image', 'test/output_with_form.png')
        .option('--supersample <n>', 'Supersampling factor', (val) => parseInt(val, 10), 8)
        .option('--scale <n>', 'General scaling factor', (val) => parseFloat(val), 1.0)
        .option('--scale-stepper <n>', 'Scaling factor for stepper', (val) => parseFloat(val), 1.0)
        .option('--scale-header <n>', 'Scaling factor for header', (val) => parseFloat(val), 1.0)
        .option('--scale-content <n>', 'Scaling factor for content/inputs', (val) => parseFloat(val), 1.0)
        .option('--scale-footer <n>', 'Scaling factor for footer', (val) => parseFloat(val), 1.0)
        .action(async (inputPath, jsonPath, logoPath, outputPath, options) => {
            const scalingOptions: ScalingOptions = {
                general: options.scale,
                stepper: options.scaleStepper,
                header: options.scaleHeader,
                content: options.scaleContent,
                footer: options.scaleFooter
            };

            // Derive debug output path
            const ext = path.extname(outputPath);
            const base = path.basename(outputPath, ext);
            const dir = path.dirname(outputPath);
            // Force .png extension for debug file to ensure it can be opened even if outputPath is .tmp
            const debugOutputPath = path.join(dir, `${base}_debug.png`);

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

                await drawBookingForm(inputPath, outputPath, rect, formData, logoPath, options.supersample, scalingOptions);

            } catch (error) {
                console.error('Error processing image:', error);
                process.exit(1);
            }
        });

    program.parse(process.argv);
}

main();
