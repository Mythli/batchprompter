import sharp from "sharp";
import fs from "fs";
import path from "path";

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

interface SidebarItem {
    icon: string;
    label?: string;
    type?: string;
    position?: string;
}

interface KPICard {
    id: string;
    label?: string;
    value: number;
    unit?: string;
    icon?: string;
    icon_color?: string;
}

interface AnalyticsSection {
    title: string;
    filters: { label: string; type: string }[];
    chart: {
        type: string;
        x_axis: string;
        y_axis: string;
        total_overlay: {
            value: string;
            currency: string;
            label: string;
        };
        trend_line: string;
    };
}

interface DataTable {
    title: string;
    columns: { key: string; label: string }[];
    rows: any[];
}

interface DashboardData {
    dashboard_interface: {
        details: {
            language: string;
            currency: string;
        };
        sidebar_navigation: {
            position: string;
            theme: string;
            items: SidebarItem[];
        };
        main_content: {
            kpi_cards: KPICard[];
            analytics_section: AnalyticsSection;
            data_table: DataTable;
        };
    };
}

interface PrimaryConfig {
    primaryColor?: string;
}

function hexToRgba(hex: string, alpha: number): string {
    let cleaned = hex.trim();
    if (cleaned.startsWith("#")) {
        cleaned = cleaned.slice(1);
    }

    if (cleaned.length === 3) {
        const c0 = cleaned[0] ?? "0";
        const c1 = cleaned[1] ?? "0";
        const c2 = cleaned[2] ?? "0";
        cleaned = c0 + c0 + c1 + c1 + c2 + c2;
    }

    const num = parseInt(cleaned, 16);
    if (Number.isNaN(num)) {
        // Fallback to default teal if parsing fails
        return `rgba(23, 162, 184, ${alpha})`;
    }

    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

async function detectScreenArea(
    inputPath: string,
    margins: Margins = { top: 0, right: 0, bottom: 0, left: 0 }
): Promise<Rectangle> {
    // 1. Analyze image
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
        throw new Error("Unable to retrieve image metadata");
    }

    const { width, height } = metadata;

    // Get raw pixel data.
    const { data } = await image
        .clone()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const visited = new Uint8Array(width * height); // 0 = unvisited, 1 = visited
    const components: {
        x: number;
        y: number;
        w: number;
        h: number;
        size: number;
    }[] = [];

    const isScreenPixel = (x: number, y: number) => {
        const offset = (y * width + x) * 4;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;

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
                let minX = x,
                    maxX = x,
                    minY = y,
                    maxY = y;
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
                        { nx: currX, ny: currY - 1 },
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
                        size: count,
                    });
                }
            }
        }
    }

    if (components.length === 0) {
        throw new Error("No screen area detected based on thresholds.");
    }

    // Heuristic: The screen is likely the component closest to the center of the image
    // that is also reasonably large.
    const centerX = width / 2;
    const centerY = height / 2;

    // Calculate a score for each component: size / distance_from_center
    const bestComponent = components.reduce(
        (best, curr) => {
            const currCx = curr.x + curr.w / 2;
            const currCy = curr.y + curr.h / 2;
            const dist = Math.sqrt(
                Math.pow(currCx - centerX, 2) + Math.pow(currCy - centerY, 2)
            );

            const score = curr.size / (dist + 1);

            if (!best || score > best.score) {
                return { comp: curr, score };
            }
            return best;
        },
        { comp: components[0], score: -1 }
    ).comp;

    if (!bestComponent) {
        throw new Error("No valid component found");
    }

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
        height: finalHeight,
    };
}

class BookingFormDrawer {
    private width: number;
    private height: number;
    private elements: string[] = [];
    private scale: number;
    private logoData?: { base64: string; width: number; height: number };
    private formData: BookingFormData;

    constructor(
        width: number,
        height: number,
        formData: BookingFormData,
        logoData?: { base64: string; width: number; height: number }
    ) {
        this.width = width;
        this.height = height;
        // Base scale on a reference width of ~375px (typical mobile width)
        this.scale = width / 375;
        if (logoData) {
            this.logoData = logoData;
        }
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

            this.elements.push(
                `<image href="${this.logoData.base64}" x="${this.s(
                    20
                )}" y="${y}" width="${targetWidth}" height="${targetHeight}" />`
            );
        }

        // Hamburger Menu
        // Increased size and thickness
        const barW = this.s(30); // 20 * 1.5
        const barH = this.s(5); // Thicker
        const gap = this.s(9); // 6 * 1.5

        const menuX = this.width - this.s(50); // Maintain ~20px right margin (20 + 30 = 50)

        // Center vertically with logo (Logo Y=30, H=42 -> Center=51)
        // Menu H = 3*5 + 2*9 = 33. Center offset = 16.5. Top = 51 - 16.5 = 34.5
        const menuY = this.s(34.5);

        this.elements.push(
            `<rect x="${menuX}" y="${menuY}" width="${barW}" height="${barH}" fill="#333" rx="${this.s(
                2.5
            )}" />`
        );
        this.elements.push(
            `<rect x="${menuX}" y="${
                menuY + gap + barH
            }" width="${barW}" height="${barH}" fill="#333" rx="${this.s(
                2.5
            )}" />`
        );
        this.elements.push(
            `<rect x="${menuX}" y="${
                menuY + (gap + barH) * 2
            }" width="${barW}" height="${barH}" fill="#333" rx="${this.s(
                2.5
            )}" />`
        );
    }

    drawStepper(y: number) {
        const startX = this.s(20);
        // Increased size by ~30% (24 -> 32, 12 -> 16)
        const circleSize = this.s(32);
        const fontSize = this.s(22); // Increased from 16
        const textOffsetY = this.s(6);

        // Step 1 (Active)
        this.elements.push(
            `<circle cx="${startX + circleSize / 2}" cy="${
                y + circleSize / 2
            }" r="${circleSize / 2}" fill="#1D1D1F" />`
        );
        this.elements.push(
            `<text x="${startX + circleSize / 2}" y="${
                y + circleSize / 2 + textOffsetY
            }" text-anchor="middle" fill="white" font-size="${fontSize}" font-family="Arial" font-weight="bold">1</text>`
        );

        // Text
        this.elements.push(
            `<text x="${startX + circleSize + this.s(10)}" y="${
                y + circleSize / 2 + textOffsetY
            }" fill="#1D1D1F" font-size="${fontSize}" font-weight="bold" font-family="Arial">${
                this.formData.stepper.step1
            }</text>`
        );

        // Step 3 (Inactive) - Right aligned
        const step3X = this.width - this.s(20) - circleSize;
        // Darker text color for inactive: #444444
        this.elements.push(
            `<circle cx="${step3X + circleSize / 2}" cy="${
                y + circleSize / 2
            }" r="${circleSize / 2}" fill="#C7C7CC" />`
        );
        this.elements.push(
            `<text x="${step3X + circleSize / 2}" y="${
                y + circleSize / 2 + textOffsetY
            }" text-anchor="middle" fill="#444444" font-size="${fontSize}" font-family="Arial">3</text>`
        );

        // Step 2 (Inactive) - Left of Step 3
        const gap = this.s(16);
        const step2X = step3X - gap - circleSize;
        this.elements.push(
            `<circle cx="${step2X + circleSize / 2}" cy="${
                y + circleSize / 2
            }" r="${circleSize / 2}" fill="#C7C7CC" />`
        );
        this.elements.push(
            `<text x="${step2X + circleSize / 2}" y="${
                y + circleSize / 2 + textOffsetY
            }" text-anchor="middle" fill="#444444" font-size="${fontSize}" font-family="Arial">2</text>`
        );
    }

    drawInfoSection(y: number) {
        const x = this.s(20);
        const lineHeight = this.s(34);

        // Title
        this.elements.push(
            `<text x="${x}" y="${y}" font-family="Arial" font-weight="bold" font-size="${this.s(
                36
            )}" fill="#000">${this.formData.header.title}</text>`
        );
        // Subtitle - Increased font size to match title
        this.elements.push(
            `<text x="${x}" y="${
                y + lineHeight
            }" font-family="Arial" font-weight="bold" font-size="${this.s(
                36
            )}" fill="#000">${this.formData.header.subtitle}</text>`
        );

        // Details
        const detailY = y + lineHeight * 2 + this.s(10);
        const detailLineHeight = this.s(18);

        this.formData.header.details.forEach((detail, index) => {
            this.elements.push(
                `<text x="${x}" y="${
                    detailY + index * detailLineHeight
                }" font-family="Arial" font-size="${this.s(
                    20
                )}" fill="#333">${detail}</text>`
            );
        });
    }

    drawInput(y: number, label: string, value: string) {
        const x = this.s(20);
        const w = this.width - this.s(40);
        const h = this.s(44);
        const radius = this.s(6);

        // Label
        this.elements.push(
            `<text x="${x}" y="${y}" font-family="Arial" font-size="${this.s(
                17
            )}" fill="#333">${label}</text>`
        );

        // Input Box
        const boxY = y + this.s(8);
        this.elements.push(
            `<rect x="${x}" y="${boxY}" width="${w}" height="${h}" rx="${radius}" fill="#F2F2F7" />`
        );

        // Value
        this.elements.push(
            `<text x="${x + this.s(12)}" y="${
                boxY + h / 2 + this.s(5)
            }" font-family="Arial" font-size="${this.s(
                20
            )}" fill="#000">${value}</text>`
        );

        // Chevron Icon
        const iconSize = this.s(10);
        const iconX = x + w - this.s(24);
        const iconY = boxY + h / 2 - iconSize / 2;
        this.elements.push(
            `<path d="M${iconX} ${iconY} L${iconX + iconSize / 2} ${
                iconY + iconSize / 2
            } L${
                iconX + iconSize
            } ${iconY}" fill="none" stroke="#999" stroke-width="${this.s(
                2
            )}" stroke-linecap="round" stroke-linejoin="round"/>`
        );
    }

    drawFooter() {
        const y = this.height - this.s(35);
        const xLeft = this.s(20);
        const xRight = this.width - this.s(20);

        // Back
        this.elements.push(
            `<text x="${xLeft}" y="${y}" font-family="Arial" font-size="${this.s(
                22
            )}" fill="#8E8E93">← ${this.formData.footer.backText}</text>`
        );

        // Next
        const fontSize = this.s(32);
        const iconR = this.s(12);

        // Center icon vertically relative to text baseline approx
        // Baseline is y. Cap height ~0.7em. Center ~ y - 0.35em.
        const iconCy = y - fontSize * 0.35;
        const iconCx = xRight - iconR;

        // Draw text
        this.elements.push(
            `<text x="${
                iconCx - iconR - this.s(10)
            }" y="${y}" text-anchor="end" font-family="Arial" font-weight="bold" font-size="${fontSize}" fill="#000">${
                this.formData.footer.nextText
            }</text>`
        );

        // Draw Icon Circle
        this.elements.push(
            `<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="none" stroke="#000" stroke-width="${this.s(
                2
            )}" />`
        );

        // Draw Arrow
        const arrowLen = this.s(10);
        const arrowHead = this.s(4);

        // Line
        this.elements.push(
            `<path d="M${iconCx - arrowLen / 2} ${iconCy} L${
                iconCx + arrowLen / 2
            } ${iconCy}" fill="none" stroke="#000" stroke-width="${this.s(
                2
            )}" stroke-linecap="round" stroke-linejoin="round"/>`
        );
        // Head
        this.elements.push(
            `<path d="M${iconCx + arrowLen / 2 - arrowHead} ${
                iconCy - arrowHead
            } L${iconCx + arrowLen / 2} ${iconCy} L${
                iconCx + arrowLen / 2 - arrowHead
            } ${
                iconCy + arrowHead
            }" fill="none" stroke="#000" stroke-width="${this.s(
                2
            )}" stroke-linecap="round" stroke-linejoin="round"/>`
        );
    }

    render() {
        this.drawHeader();
        this.drawStepper(this.s(100));
        this.drawInfoSection(this.s(180));

        let inputY = this.s(310);
        const inputGap = this.s(85);

        this.formData.inputs.forEach((input, index) => {
            this.drawInput(inputY + inputGap * index, input.label, input.value);
        });

        this.drawFooter();
    }

    getSvg(): string {
        return `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${
            this.width
        } ${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <clipPath id="canvasClip">
                    <rect x="0" y="0" width="${this.width}" height="${
            this.height
        }" rx="0" ry="0" />
                </clipPath>
            </defs>
            <g clip-path="url(#canvasClip)">
                ${this.elements.join("\n")}
            </g>
        </svg>
        `;
    }
}

class DashboardDrawer {
    private width: number;
    private height: number;
    private elements: string[] = [];
    private scale: number;
    private data: DashboardData;
    private primaryColor: string;
    private logoData?: { base64: string; width: number; height: number };
    private userImageData?: { base64: string; width: number; height: number };

    constructor(
        width: number,
        height: number,
        data: DashboardData,
        primaryColor: string,
        logoData?: { base64: string; width: number; height: number },
        userImageData?: { base64: string; width: number; height: number }
    ) {
        this.width = width;
        this.height = height;
        // Base scale on a reference width of 1440px (desktop)
        this.scale = width / 1440;
        this.data = data;
        this.primaryColor = primaryColor;
        if (logoData) {
            this.logoData = logoData;
        }
        if (userImageData) {
            this.userImageData = userImageData;
        }
    }

    private s(val: number): number {
        return val * this.scale;
    }

    private mapIconName(iconName: string): string {
        // Map data icon names to our SVG icon names
        const iconMapping: { [key: string]: string } = {
            "file-invoice": "ticket",
            tag: "discount",
            envelope: "notifications", // Map envelope to notifications if needed
            cog: "settings",
            "question-circle": "help",
            booking: "booking",
        };
        return iconMapping[iconName.toLowerCase()] || iconName.toLowerCase();
    }

    private getIconPath(iconName: string): string | null {
        const mappedName = this.mapIconName(iconName);
        const iconPaths: { [key: string]: string } = {
            search: "M456.69 421.39 362.6 327.3a173.81 173.81 0 0 0 34.84-104.58C397.44 126.38 319.06 48 222.72 48S48 126.38 48 222.72s78.38 174.72 174.72 174.72A173.81 173.81 0 0 0 327.3 362.6l94.09 94.09a25 25 0 0 0 35.3-35.3zM97.92 222.72a124.8 124.8 0 1 1 124.8 124.8 124.95 124.95 0 0 1-124.8-124.8z",
            home: "M946.5 505L534.6 93.4a31.93 31.93 0 0 0-45.2 0L77.5 505c-12 12-18.8 28.3-18.8 45.3 0 35.3 28.7 64 64 64h43.4V908c0 17.7 14.3 32 32 32H448V716h112v224h265.9c17.7 0 32-14.3 32-32V614.3h43.4c17 0 33.3-6.7 45.3-18.8 24.9-25 24.9-65.5-.1-90.5z",
            user: "M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z",
            booking:
                "M199.47 115.52 A 0.81 0.80 2.8 0 1 200.20 116.32 Q 200.19 139.70 200.25 150.01 Q 200.30 157.23 197.82 161.26 Q 194.41 166.79 188.20 169.28 Q 185.27 170.45 175.77 170.42 Q 152.63 170.35 43.61 170.41 Q 34.47 170.41 31.16 169.04 Q 22.13 165.31 19.80 154.53 A 1.93 1.74 42.0 0 1 19.76 154.15 L 19.76 116.35 A 0.85 0.84 87.8 0 1 20.54 115.50 C 39.29 113.93 43.75 89.79 26.95 81.55 Q 24.02 80.11 20.78 80.11 A 0.96 0.95 -0.3 0 1 19.82 79.17 Q 19.62 59.87 19.77 43.51 Q 19.86 34.62 26.24 28.52 Q 27.98 26.85 29.78 26.34 Q 33.25 25.34 38.01 25.34 Q 161.57 25.29 181.76 25.34 Q 186.64 25.36 189.17 26.58 Q 195.89 29.84 198.89 36.43 Q 200.30 39.51 200.26 46.33 Q 200.20 58.98 200.22 78.94 A 1.08 1.08 0.0 0 1 199.11 80.02 Q 196.02 79.93 192.86 81.62 C 181.95 87.45 178.83 100.74 187.50 109.92 Q 192.14 114.83 199.47 115.52 Z M 129.76 79.60 A 19.76 19.76 0.0 0 0 110.00 59.84 A 19.76 19.76 0.0 0 0 90.24 79.60 A 19.76 19.76 0.0 0 0 110.00 99.36 A 19.76 19.76 0.0 0 0 129.76 79.60 Z M 110.00 142.62 Q 149.19 142.62 149.35 142.62 A 0.45 0.44 -88.7 0 0 149.79 142.19 Q 150.01 137.14 149.78 134.57 C 149.25 128.64 141.90 124.11 137.06 122.11 Q 123.31 116.41 110.00 116.41 Q 96.68 116.41 82.94 122.10 C 78.09 124.11 70.74 128.64 70.21 134.57 Q 69.98 137.14 70.20 142.19 A 0.45 0.44 88.7 0 0 70.64 142.62 Q 70.80 142.62 110.00 142.62 Z",
            messages:
                "M 20.66 8.28 Q 45.01 8.36 171.50 8.35 C 178.09 8.35 184.27 13.85 186.83 19.60 Q 188.16 22.56 188.14 29.10 Q 188.05 85.20 188.09 136.89 A 5.40 5.32 52.2 0 1 187.94 138.15 Q 185.39 148.40 176.57 152.06 Q 173.33 153.41 164.74 153.40 Q 66.81 153.28 32.25 153.40 Q 22.43 153.44 18.96 151.89 C 13.00 149.24 7.82 142.66 7.82 135.75 Q 7.82 115.99 7.80 25.50 Q 7.80 23.61 9.55 17.49 A 1.52 1.50 -5.6 0 1 10.34 16.54 L 11.45 15.98 A 0.56 0.48 -82.8 0 0 11.65 15.80 Q 15.04 10.42 19.79 8.45 A 2.13 2.05 -55.0 0 1 20.66 8.28 Z M 97.99 88.84 Q 98.35 88.84 98.79 88.57 Q 139.53 63.26 169.44 44.79 A 0.77 0.75 74.6 0 0 169.80 44.14 L 169.80 28.37 A 0.46 0.46 0.0 0 0 169.09 27.98 Q 132.98 50.50 98.24 72.28 Q 98.13 72.35 97.99 72.35 Q 97.85 72.35 97.74 72.28 Q 63.00 50.50 26.89 27.97 A 0.46 0.46 0.0 0 0 26.18 28.36 L 26.18 44.13 A 0.77 0.75 -74.6 0 0 26.54 44.78 Q 56.45 63.26 97.19 88.57 Q 97.62 88.84 97.99 88.84 Z",
            accounts:
                "M 127.86 34.61 A 1.67 1.67 0.0 0 1 129.05 35.11 L 181.53 87.56 A 3.16 3.00 -81.7 0 1 182.13 88.41 Q 182.68 89.57 182.66 93.51 Q 182.57 112.61 182.58 196.00 C 182.59 206.18 176.07 213.68 165.70 214.95 Q 163.52 215.22 160.28 215.22 Q 106.06 215.28 55.76 215.22 Q 54.76 215.22 50.50 214.14 C 44.93 212.74 40.65 208.39 38.56 203.27 Q 37.21 199.93 37.43 192.10 Q 37.46 191.11 37.67 54.00 C 37.67 49.87 38.68 45.97 40.86 42.49 Q 45.85 34.56 57.23 34.58 Q 99.86 34.63 127.86 34.61 Z M 157.36 88.59 A 0.41 0.41 0.0 0 0 157.65 87.89 L 119.92 50.16 A 0.41 0.41 0.0 0 0 119.22 50.45 L 119.24 88.16 A 0.41 0.41 0.0 0 0 119.65 88.57 L 157.36 88.59 Z M 110.00 151.19 Q 117.82 151.21 118.31 151.21 A 0.96 0.95 -89.8 0 1 119.25 152.17 L 119.25 160.12 A 1.07 1.07 0.0 0 1 118.18 161.19 L 83.85 161.19 A 0.37 0.37 0.0 0 0 83.48 161.56 L 83.48 177.58 A 0.61 0.61 0.0 0 0 84.09 178.19 L 100.49 178.19 A 1.09 1.09 0.0 0 1 101.58 179.28 L 101.58 186.44 A 0.90 0.90 0.0 0 0 102.48 187.34 L 117.88 187.34 A 0.52 0.52 0.0 0 0 118.40 186.82 L 118.40 179.24 A 1.06 1.06 0.0 0 1 119.46 178.18 L 129.55 178.18 A 1.25 1.19 31.3 0 0 130.06 178.07 Q 136.42 175.17 136.48 169.49 Q 136.61 156.74 136.54 144.01 Q 136.50 136.56 129.86 134.37 A 2.76 2.61 -33.8 0 0 129.14 134.25 Q 128.09 134.22 110.00 134.18 Q 102.18 134.17 101.69 134.16 A 0.96 0.95 -89.8 0 1 100.75 133.21 L 100.75 125.26 A 1.07 1.07 0.0 0 1 101.82 124.19 L 136.15 124.19 A 0.37 0.37 0.0 0 0 136.52 123.82 L 136.52 107.80 A 0.61 0.61 0.0 0 0 135.91 107.19 L 119.51 107.19 A 1.09 1.09 0.0 0 1 118.42 106.10 L 118.42 98.94 A 0.90 0.90 0.0 0 0 117.52 98.04 L 102.12 98.04 A 0.52 0.52 0.0 0 0 101.60 98.56 L 101.60 106.14 A 1.06 1.06 0.0 0 1 100.54 107.20 L 90.45 107.20 A 1.25 1.19 31.3 0 0 89.94 107.31 Q 83.58 110.21 83.52 115.89 Q 83.39 128.64 83.46 141.37 Q 83.50 148.82 90.14 151.01 A 2.76 2.61 -33.8 0 0 90.86 151.13 Q 91.91 151.16 110.00 151.19 Z",
            payment:
                "M 249.8835 148.4914 A 24.10 24.10 0.0 0 1 225.8256 172.6334 L 58.0058 172.9263 A 24.10 24.10 0.0 0 1 33.8638 148.8684 L 33.6965 53.0286 A 24.10 24.10 0.0 0 1 57.7544 28.8866 L 225.5742 28.5937 A 24.10 24.10 0.0 0 1 249.7162 52.6516 L 249.8835 148.4914 Z M 177.85 100.94 A 35.91 35.91 0.0 0 0 141.94 65.03 A 35.91 35.91 0.0 0 0 106.03 100.94 A 35.91 35.91 0.0 0 0 141.94 136.85 A 35.91 35.91 0.0 0 0 177.85 100.94 Z M 70.44 196.99 L 273.34 196.99 A 0.63 0.62 0.0 0 0 273.97 196.37 L 273.97 65.25 A 0.52 0.51 -90.0 0 1 274.48 64.73 L 297.60 64.73 A 0.61 0.61 0.0 0 1 298.21 65.34 Q 298.15 124.21 298.23 195.76 Q 298.24 204.43 293.73 210.77 Q 286.36 221.15 273.78 221.16 Q 88.81 221.26 70.27 221.12 A 0.49 0.49 0.0 0 1 69.78 220.63 L 69.78 197.65 A 0.66 0.66 0.0 0 1 70.44 196.99 Z",
            bank: "M 156.03 36.96 C 156.03 36.96 156.28 36.96 156.31 36.98 Q 221.09 71.13 268.00 95.99 Q 268.80 96.42 269.40 96.64 A 0.84 0.84 0.0 0 1 269.95 97.43 L 269.95 120.63 A 0.59 0.59 0.0 0 1 269.36 121.22 Q 267.74 121.24 156.04 121.25 Q 44.33 121.26 42.71 121.24 A 0.59 0.59 0.0 0 1 42.12 120.64 L 42.12 97.44 A 0.84 0.84 0.0 0 1 42.67 96.65 Q 43.27 96.43 44.07 96.00 Q 90.97 71.14 155.75 36.98 C 155.78 36.96 156.03 36.96 156.03 36.96 Z M 65.74 144.72 H 101.76 V 229.26 H 65.74 Z M 137.73 144.72 H 173.77 V 229.26 H 137.73 Z M 209.73 144.71 H 245.79 V 229.27 H 209.73 Z M 42.24 252.72 H 270.04 V 288.80 H 42.24 Z",
            ticket: "M64 64C28.7 64 0 92.7 0 128l0 64c0 8.8 7.4 15.7 15.7 18.6C34.5 217.1 48 235 48 256s-13.5 38.9-32.3 45.4C7.4 304.3 0 311.2 0 320l0 64c0 35.3 28.7 64 64 64l448 0c35.3 0 64-28.7 64-64l0-64c0-8.8-7.4-15.7-15.7-18.6C541.5 294.9 528 277 528 256s13.5-38.9 32.3-45.4c8.3-2.9 15.7-9.8 15.7-18.6l0-64c0-35.3-28.7-64-64-64L64 64zm64 112l0 160c0 8.8 7.2 16 16 16l288 0c8.8 0 16-7.2 16-16l0-160c0-8.8-7.2-16-16-16l-288 0c-8.8 0-16 7.2-16 16zM96 160c0-17.7 14.3-32 32-32l320 0c17.7 0 32 14.3 32 32l0 192c0 17.7-14.3 32-32 32l-320 0c-17.7 0-32-14.3-32-32l0-192z",
            notifications:
                "M255.9 456c31.1 0 48.1-22 48.1-53h-96.3c0 31 17 53 48.2 53zM412 352.2c-15.4-20.3-45.7-32.2-45.7-123.1 0-93.3-41.2-130.8-79.6-139.8-3.6-.9-6.2-2.1-6.2-5.9v-2.9c0-13.4-11-24.7-24.4-24.6-13.4-.2-24.4 11.2-24.4 24.6v2.9c0 3.7-2.6 5-6.2 5.9-38.5 9.1-79.6 46.5-79.6 139.8 0 90.9-30.3 102.7-45.7 123.1-9.9 13.1-.5 31.8 15.9 31.8h280.1c16.3 0 25.7-18.8 15.8-31.8z",
            discount:
                "M 206.90 210.84 Q 168.17 249.59 163.85 253.84 Q 159.74 257.89 153.00 259.20 Q 144.75 260.80 137.43 257.59 Q 134.14 256.15 129.10 251.10 Q 91.14 213.08 24.62 146.69 Q 20.32 142.39 18.67 139.21 Q 16.32 134.70 16.30 129.95 Q 16.11 93.04 16.22 43.76 C 16.23 37.45 18.75 31.72 23.19 27.28 C 27.63 22.83 33.36 20.31 39.67 20.29 Q 88.95 20.14 125.86 20.31 Q 130.61 20.32 135.12 22.67 Q 138.30 24.32 142.61 28.61 Q 209.05 95.08 247.10 133.01 Q 252.15 138.05 253.59 141.34 Q 256.81 148.66 255.21 156.91 Q 253.91 163.65 249.86 167.77 Q 245.62 172.08 206.90 210.84 Z M 54.42 79.51 C 56.31 79.48 58.08 79.94 59.98 79.61 C 72.32 77.46 78.99 65.88 74.18 54.24 C 73.03 51.47 70.28 49.16 68.15 47.10 A 4.28 4.09 -7.0 0 0 67.28 46.45 C 59.00 41.74 49.08 43.64 43.36 51.29 C 37.70 58.88 39.09 68.12 45.33 75.27 A 2.30 2.28 77.6 0 0 46.38 75.95 Q 47.40 76.26 48.26 77.24 A 2.52 2.49 78.1 0 0 49.32 77.94 L 53.54 79.38 A 2.67 2.63 53.0 0 0 54.42 79.51 Z",
            settings:
                "M413.967 276.8c1.06-6.235 1.06-13.518 1.06-20.8s-1.06-13.518-1.06-20.8l44.667-34.318c4.26-3.118 5.319-8.317 2.13-13.518L418.215 115.6c-2.129-4.164-8.507-6.235-12.767-4.164l-53.186 20.801c-10.638-8.318-23.394-15.601-36.16-20.801l-7.448-55.117c-1.06-4.154-5.319-8.318-10.638-8.318h-85.098c-5.318 0-9.577 4.164-10.637 8.318l-8.508 55.117c-12.767 5.2-24.464 12.482-36.171 20.801l-53.186-20.801c-5.319-2.071-10.638 0-12.767 4.164L49.1 187.365c-2.119 4.153-1.061 10.399 2.129 13.518L96.97 235.2c0 7.282-1.06 13.518-1.06 20.8s1.06 13.518 1.06 20.8l-44.668 34.318c-4.26 3.118-5.318 8.317-2.13 13.518L92.721 396.4c2.13 4.164 8.508 6.235 12.767 4.164l53.187-20.801c10.637 8.318 23.394 15.601 36.16 20.801l8.508 55.117c1.069 5.2 5.318 8.318 10.637 8.318h85.098c5.319 0 9.578-4.164 10.638-8.318l8.518-55.117c12.757-5.2 24.464-12.482 36.16-20.801l53.187 20.801c5.318 2.071 10.637 0 12.767-4.164l42.549-71.765c2.129-4.153 1.06-10.399-2.13-13.518l-46.8-34.317zm-158.499 52c-41.489 0-74.46-32.235-74.46-72.8s32.971-72.8 74.46-72.8 74.461 32.235 74.461 72.8-32.972 72.8-74.461 72.8z",
            help: "M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64zm-6 304a20 20 0 1 1 20-20 20 20 0 0 1-20 20zm33.44-102C267.23 276.88 265 286.85 265 296a14 14 0 0 1-28 0c0-21.91 10.08-39.33 30.82-53.26C287.1 229.8 298 221.6 298 203.57c0-12.26-7-21.57-21.49-28.46-3.41-1.62-11-3.2-20.34-3.09-11.72.15-20.82 2.95-27.83 8.59C215.12 191.25 214 202.83 214 203a14 14 0 1 1-28-1.35c.11-2.43 1.8-24.32 24.77-42.8 11.91-9.58 27.06-14.56 45-14.78 12.7-.15 24.63 2 32.72 5.82C312.7 161.34 326 180.43 326 203.57c0 33.83-22.61 49.02-42.56 62.43z",
        };
        return iconPaths[mappedName] || null;
    }

    private getIconViewBox(iconName: string): string {
        const mappedName = this.mapIconName(iconName);
        const viewBoxes: { [key: string]: string } = {
            search: "0 0 512 512",
            home: "0 0 1024 1024",
            user: "0 0 24 24",
            booking: "0 0 220 200",
            messages: "0 0 194 162",
            accounts: "0 0 220 260",
            payment: "0 0 332 256",
            bank: "0 0 316 342",
            ticket: "0 0 576 512",
            notifications: "0 0 512 512",
            discount: "0 0 274 282",
            settings: "0 0 512 512",
            help: "0 0 512 512",
        };
        return viewBoxes[mappedName] || "0 0 24 24";
    }

    drawSidebar() {
        const sidebarW = this.s(80); // Sidebar width - reduced
        const themeColor =
            this.data.dashboard_interface.sidebar_navigation.theme === "teal"
                ? this.primaryColor || "#17A2B8"
                : "#333"; // Teal or dark

        // Sidebar BG
        this.elements.push(
            `<rect x="0" y="0" width="${sidebarW}" height="${this.height}" fill="${themeColor}" />`
        );

        const items = this.data.dashboard_interface.sidebar_navigation.items;
        let currentY = this.s(40);

        // Define allowed top icons (only these will be shown)
        const allowedTopIcons = [
            "search",
            "home",
            "user",
            "booking",
            "messages",
            "accounts",
            "payment",
            "bank",
            "discount",
        ];

        // Top items - filter to only show allowed icons
        const topItems = items.filter((i) => {
            if (i.type === "brand") return true; // Always show brand/logo
            if (i.position === "bottom") return false; // Skip bottom items
            // Only show if mapped icon name is in allowed list
            if (!i.icon) return false;
            const mappedIconName = this.mapIconName(i.icon.toLowerCase());
            return allowedTopIcons.includes(mappedIconName);
        });

        topItems.forEach((item) => {
            if (item.type === "brand") {
                // Logo area
                if (this.logoData) {
                    const targetHeight = this.s(42); // Bigger logo size
                    const aspectRatio =
                        this.logoData.width / this.logoData.height;
                    const targetWidth = targetHeight * aspectRatio;
                    const logoX = (sidebarW - targetWidth) / 2; // Center logo in sidebar

                    // Logo image – force it to render as white on the colored sidebar
                    // by using an SVG filter trick (assumes a darker original icon).
                    this.elements.push(
                        `<image href="${this.logoData.base64}" x="${logoX}" y="${currentY}" width="${targetWidth}" height="${targetHeight}" style="filter: brightness(0) invert(1);" />`
                    );
                }
                currentY += this.s(80); // Slightly more spacing for bigger logo
            } else {
                // Menu Item with SVG icon
                const iconName = item.icon?.toLowerCase() || "";
                const mappedIconName = this.mapIconName(iconName);
                // Treat the home icon as the "selected" / current item
                const isCurrent = mappedIconName === "home";
                // Make some icons larger
                const baseIconSize = this.s(28); // Increased from 20
                const iconSize =
                    mappedIconName === "notifications"
                        ? this.s(32) // Slightly larger notifications
                        : mappedIconName === "accounts"
                        ? baseIconSize * 1.2 // Slightly larger accounts icon
                        : mappedIconName === "payment"
                        ? baseIconSize * 1.1 // Slightly larger payment icon
                        : mappedIconName === "bank"
                        ? baseIconSize * 1.15 // Slightly larger bank icon
                        : mappedIconName === "messages"
                        ? baseIconSize * 0.85 // Slightly smaller messages icon
                        : mappedIconName === "discount"
                        ? baseIconSize * 0.8 // Slightly smaller discount icon
                        : mappedIconName === "search"
                        ? baseIconSize * 0.9
                        : baseIconSize;
                const iconPath = this.getIconPath(iconName);
                const viewBox = this.getIconViewBox(iconName);
                const x = (sidebarW - iconSize) / 2; // Center icon in sidebar

                // Draw background indicator for current (selected) icon
                if (isCurrent) {
                    const bgSize = iconSize + this.s(22); // More padding for a stronger highlight
                    const bgX = (sidebarW - bgSize) / 2;
                    const bgY = currentY - this.s(11); // Slightly larger vertical padding
                    this.elements.push(
                        `<rect x="${bgX}" y="${bgY}" width="${bgSize}" height="${bgSize}" fill="white" opacity="0.3" rx="${this.s(
                            14
                        )}" />`
                    );
                }

                if (iconPath) {
                    // Draw SVG icon
                    // Parse viewBox to get dimensions for proper scaling
                    const viewBoxParts = viewBox.split(" ");
                    const viewBoxWidth = parseFloat(viewBoxParts[2] || "24");
                    const viewBoxHeight = parseFloat(viewBoxParts[3] || "24");
                    const scale =
                        iconSize / Math.max(viewBoxWidth, viewBoxHeight);
                    // Slight offset for specific icons
                    const iconX =
                        mappedIconName === "accounts"
                            ? x + this.s(3)
                            : mappedIconName === "bank"
                            ? x + this.s(2)
                            : x;
                    const iconY =
                        mappedIconName === "accounts"
                            ? currentY - this.s(4)
                            : currentY;
                    // Make current icon brighter
                    const iconOpacity = isCurrent ? "1" : "0.9";
                    this.elements.push(
                        `<g transform="translate(${iconX}, ${iconY}) scale(${scale})">
                                <svg viewBox="${viewBox}" width="${viewBoxWidth}" height="${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg">
                                    <path d="${iconPath}" fill="white" stroke="none" opacity="${iconOpacity}"/>
                                </svg>
                            </g>`
                    );
                } else {
                    // Fallback placeholder if icon not found
                    this.elements.push(
                        `<rect x="${x}" y="${currentY}" width="${iconSize}" height="${iconSize}" fill="white" opacity="0.8" rx="${this.s(
                            4
                        )}" />`
                    );
                }

                // Label - removed
                currentY += this.s(50);
            }
        });

        // User image at very bottom (avatar)
        let bottomY = this.height - this.s(20);
        if (this.userImageData) {
            const targetSize = this.s(40);
            const aspectRatio =
                this.userImageData.width / this.userImageData.height;
            const targetWidth =
                aspectRatio >= 1 ? targetSize : targetSize * aspectRatio;
            const targetHeight =
                aspectRatio >= 1 ? targetSize / aspectRatio : targetSize;
            const avatarX = (sidebarW - targetWidth) / 2;
            const avatarY = bottomY - targetHeight;

            // Optional circular mask effect via clipPath-like trick (simple circle bg)
            this.elements.push(
                `<circle cx="${sidebarW / 2}" cy="${
                    avatarY + targetHeight / 2
                }" r="${targetSize / 2}" fill="white" opacity="0.2" />`
            );

            this.elements.push(
                `<image href="${
                    this.userImageData.base64
                }" x="${avatarX}" y="${avatarY}" width="${targetWidth}" height="${targetHeight}" clip-path="circle(${
                    targetSize / 2
                }px at ${sidebarW / 2}px ${avatarY + targetHeight / 2}px)" />`
            );

            bottomY = avatarY - this.s(20);
        }

        // Bottom navigation items above the user image
        const bottomItems = items
            .filter((i) => i.position === "bottom")
            .reverse();

        bottomItems.forEach((item) => {
            const iconName = item.icon?.toLowerCase() || "";
            const mappedIconName = this.mapIconName(iconName);

            // Skip home icon entirely for bottom items
            if (mappedIconName === "home") {
                return;
            }

            const iconPath = this.getIconPath(iconName);

            // Skip items without valid icon paths (no placeholders)
            if (!iconPath) {
                return;
            }

            const iconSize = this.s(28); // Increased from 20
            const viewBox = this.getIconViewBox(iconName);
            const x = (sidebarW - iconSize) / 2; // Center icon in sidebar

            // Draw SVG icon
            const viewBoxParts = viewBox.split(" ");
            const viewBoxWidth = parseFloat(viewBoxParts[2] || "24");
            const viewBoxHeight = parseFloat(viewBoxParts[3] || "24");
            const scale = iconSize / Math.max(viewBoxWidth, viewBoxHeight);
            const iconX = x;
            const iconY = bottomY - iconSize;
            this.elements.push(
                `<g transform="translate(${iconX}, ${iconY}) scale(${scale})">
                    <svg viewBox="${viewBox}" width="${viewBoxWidth}" height="${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg">
                        <path d="${iconPath}" fill="white" stroke="none" opacity="0.8"/>
                    </svg>
                </g>`
            );

            // Label - removed
            bottomY -= this.s(50);
        });
    }

    drawKPICards(startX: number, startY: number) {
        const cards = this.data.dashboard_interface.main_content.kpi_cards;
        const gap = this.s(20);
        // 3 cards, distribute width
        const totalW = this.width - startX - this.s(20); // Reduced right padding
        const cardW = (totalW - gap * (cards.length - 1)) / cards.length;
        const cardH = this.s(120);

        cards.forEach((card, index) => {
            const x = startX + index * (cardW + gap);
            const y = startY;

            // Card BG
            this.elements.push(
                `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="white" rx="${this.s(
                    8
                )}" filter="url(#shadow)" />`
            );

            // Label (Top) - bigger font
            this.elements.push(
                `<text x="${x + this.s(20)}" y="${
                    y + this.s(30)
                }" font-family="Arial" font-size="${this.s(24)}" fill="#666">${
                    card.label || ""
                }</text>`
            );

            // Value (Middle/Big) - more space from title
            if (card.value) {
                this.elements.push(
                    `<text x="${x + this.s(20)}" y="${
                        y + this.s(95)
                    }" font-family="Arial" font-weight="bold" font-size="${this.s(
                        50
                    )}" fill="#333">${card.value}</text>`
                );
            }

            // Icon/Right content - skip icon for card 3 (index 2)
            if (card.icon && index !== 2) {
                const iconSize = this.s(40);
                const iconX = x + cardW - this.s(20) - iconSize;
                const iconY = y + (cardH - iconSize) / 2;
                const color = card.icon_color === "green" ? "#28a745" : "#333";

                // Simple icon representation
                this.elements.push(
                    `<rect x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" fill="none" stroke="${color}" stroke-width="2" rx="4" />`
                );
                // Arrow out for sign-out
                if (card.icon === "sign-out-alt") {
                    this.elements.push(
                        `<path d="M${iconX + iconSize / 2} ${
                            iconY + iconSize / 2
                        } L${iconX + iconSize - 5} ${
                            iconY + iconSize / 2
                        }" stroke="${color}" stroke-width="2"/>`
                    );
                }
            }
        });
    }

    drawAnalytics(startX: number, startY: number) {
        const section =
            this.data.dashboard_interface.main_content.analytics_section;
        const width = this.width - startX - this.s(20); // Reduced right padding
        const height = this.s(300);

        // BG
        this.elements.push(
            `<rect x="${startX}" y="${startY}" width="${width}" height="${height}" fill="white" rx="${this.s(
                8
            )}" filter="url(#shadow)" />`
        );

        // Title - increased font size and spacing
        this.elements.push(
            `<text x="${startX + this.s(20)}" y="${
                startY + this.s(40)
            }" font-family="Arial" font-weight="bold" font-size="${this.s(
                28
            )}" fill="#333" letter-spacing="1">${section.title}</text>`
        );

        // Chart Area (Simplified Line Chart) - adjusted spacing for bigger text
        const chartX = startX + this.s(20);
        const chartY = startY + this.s(80); // More space after title
        // Extra right padding so the chart doesn't touch the edge
        const chartW = width - this.s(40);
        const chartH = height - this.s(100); // More space for text above

        // Grid lines
        for (let i = 0; i <= 4; i++) {
            const lineY = chartY + (chartH * i) / 4;
            this.elements.push(
                `<line x1="${chartX}" y1="${lineY}" x2="${
                    chartX + chartW
                }" y2="${lineY}" stroke="#eee" stroke-width="1" />`
            );
        }

        // Y-axis money labels (left side), from max to min value
        const maxValue = 970;
        const minValue = 630;
        const steps = 4; // 5 labels including min and max
        const valueStep = (maxValue - minValue) / steps;
        const currencySymbol = section.chart.total_overlay?.currency || "€";

        for (let i = 0; i <= steps; i++) {
            const value = maxValue - valueStep * i;
            // Slightly above the grid line so text doesn't sit on the line
            const labelY = chartY + (chartH * i) / steps - this.s(8);
            // Shift labels ~50px into the chart area
            const labelX = chartX;
            this.elements.push(
                `<text x="${labelX}" y="${labelY}" text-anchor="start" font-family="Arial" font-size="${this.s(
                    14
                )}" fill="#999">${currencySymbol}${value.toFixed(0)}</text>`
            );
        }

        // X-axis month labels under the chart
        const months = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ];
        const monthCount = months.length;
        // Position labels slightly below the chart
        const monthY = chartY + chartH + this.s(14);
        for (let i = 0; i < monthCount; i++) {
            const monthX = chartX + (chartW * i) / Math.max(1, monthCount - 1);
            this.elements.push(
                `<text x="${monthX}" y="${monthY}" text-anchor="middle" font-family="Arial" font-size="${this.s(
                    14
                )}" fill="#999">${months[i]}</text>`
            );
        }

        // Normalized values between 0.1 and 1 (bottom to top of chart),
        // 12 points to match 12 months on the X-axis.
        const hardcodedValues = [
            0.1, 0.2, 0.25, 0.3, 0.28, 0.35, 0.4, 0.45, 0.55, 0.6, 0.75, 1,
        ];

        let pathPoints: [number, number][] = [];
        const pointCount = hardcodedValues.length;

        // Map each value to a point across the chart width
        for (let i = 0; i < pointCount; i++) {
            const px = chartX + (chartW * i) / Math.max(1, pointCount - 1); // avoid divide by zero
            const val = hardcodedValues[i]!;
            const py = chartY + chartH - chartH * val;
            pathPoints.push([px, py]);
        }

        // Area path
        let areaD = `M ${chartX} ${chartY + chartH}`;
        pathPoints.forEach((p) => (areaD += ` L ${p[0]} ${p[1]}`));
        areaD += ` L ${chartX + chartW} ${chartY + chartH} Z`;

        const areaFill = this.primaryColor
            ? hexToRgba(this.primaryColor, 0.1)
            : "rgba(23, 162, 184, 0.1)";
        this.elements.push(`<path d="${areaD}" fill="${areaFill}" />`);

        if (pathPoints.length > 0) {
            // Line path
            let lineD = `M ${pathPoints[0]![0]} ${pathPoints[0]![1]}`;
            pathPoints.slice(1).forEach((p) => (lineD += ` L ${p[0]} ${p[1]}`));

            const lineColor = this.primaryColor || "#17A2B8";
            this.elements.push(
                `<path d="${lineD}" fill="none" stroke="${lineColor}" stroke-width="${this.s(
                    2
                )}" />`
            );

            // Points
            pathPoints.forEach((p) => {
                const pointColor = this.primaryColor || "#17A2B8";
                this.elements.push(
                    `<circle cx="${p[0]}" cy="${p[1]}" r="${this.s(
                        3
                    )}" fill="${pointColor}" stroke="white" stroke-width="1" />`
                );
            });
        }

        // Total Overlay (Top Right) - label to the left of money
        const total = section.chart.total_overlay;
        if (total) {
            const moneyText = `${total.currency}${total.value}`;
            const moneyFontSize = this.s(36);
            const labelFontSize = this.s(20);
            const spacing = this.s(5); // Space between label and money - further reduced

            // Calculate money text width (approximate)
            const moneyWidth = moneyText.length * moneyFontSize * 0.6; // Approximate character width
            const moneyX = startX + width - this.s(20);
            const labelX = moneyX - moneyWidth - spacing;
            const textY = startY + this.s(50);

            // Label to the left
            this.elements.push(
                `<text x="${labelX}" y="${textY}" text-anchor="end" font-family="Arial" font-size="${labelFontSize}" fill="#999">${total.label}</text>`
            );

            // Money value
            this.elements.push(
                `<text x="${moneyX}" y="${textY}" text-anchor="end" font-family="Arial" font-weight="bold" font-size="${moneyFontSize}" fill="#333">${moneyText}</text>`
            );
        }
    }

    drawTable(startX: number, startY: number) {
        const table = this.data.dashboard_interface.main_content.data_table;
        const width = this.width - startX - this.s(20); // Reduced right padding
        const height = this.height - startY - this.s(20); // Use remaining height

        // BG
        this.elements.push(
            `<rect x="${startX}" y="${startY}" width="${width}" height="${height}" fill="white" rx="${this.s(
                8
            )}" filter="url(#shadow)" />`
        );

        // Title - match analytics title styles
        this.elements.push(
            `<text x="${startX + this.s(20)}" y="${
                startY + this.s(40)
            }" font-family="Arial" font-weight="bold" font-size="${this.s(
                28
            )}" fill="#333" letter-spacing="1">${table.title.toUpperCase()}</text>`
        );

        // Columns - filter out checkbox, id, and email columns
        const visibleColumns = table.columns.filter(
            (col) =>
                col.key !== "select" && col.key !== "id" && col.key !== "email"
        );
        // Push header/rows slightly down to leave more space under the title
        const colY = startY + this.s(80);
        const colCount = visibleColumns.length;

        // Responsive column widths based on column type
        const getColumnWidth = (col: { key: string; label: string }) => {
            if (col.key === "id") return 0.08; // 8% for ID
            if (col.key === "name") return 0.2; // 20% for name
            if (col.key === "phone") return 0.18; // 18% for phone
            if (col.key === "amount") return 0.12; // 12% for amount
            if (col.key === "status") return 0.17; // 17% for status
            return 1 / colCount; // Equal distribution for others
        };

        const colWidths = visibleColumns.map((col) => getColumnWidth(col));
        const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
        // Normalize widths to sum to 1
        const normalizedWidths = colWidths.map((w) => w / totalWidth);

        // Header Background
        this.elements.push(
            `<rect x="${startX}" y="${
                colY - this.s(20)
            }" width="${width}" height="${this.s(50)}" fill="#f8f9fa" />`
        );

        let currentX = startX + this.s(20);
        visibleColumns.forEach((col, index) => {
            const colW = width * normalizedWidths[index]!;
            // Add an extra gap before the status column to move it further right
            if (col.key === "status") {
                currentX += this.s(40);
            }
            this.elements.push(
                `<text x="${currentX}" y="${
                    colY + this.s(16)
                }" font-family="Arial" font-weight="bold" font-size="${this.s(
                    32
                )}" fill="#666">${col.label}</text>`
            );
            currentX += colW;
        });

        // Rows - slight offset below header labels (more compact)
        let rowY = colY + this.s(60);
        table.rows.forEach((row, i) => {
            // Alternating row bg? Maybe just lines
            this.elements.push(
                `<line x1="${startX}" y1="${rowY + this.s(16)}" x2="${
                    startX + width
                }" y2="${rowY + this.s(16)}" stroke="#eee" stroke-width="1" />`
            );

            let currentX = startX + this.s(20);
            visibleColumns.forEach((col, cIndex) => {
                let val = row[col.key];
                let color = "#333";
                const colW = width * normalizedWidths[cIndex]!;

                if (col.key === "status") {
                    color =
                        row["status_color"] === "green"
                            ? "#28a745"
                            : row["status_color"] === "brown"
                            ? "#a52a2a"
                            : "#333";
                }

                // Add the same extra gap before the status column values
                if (col.key === "status") {
                    currentX += this.s(40);
                }

                // Only render text if val is not undefined
                if (val !== undefined && val !== null) {
                    this.elements.push(
                        `<text x="${currentX}" y="${
                            rowY + this.s(9)
                        }" font-family="Arial" font-size="${this.s(
                            30
                        )}" fill="${color}">${val}</text>`
                    );
                }

                currentX += colW;
            });
            rowY += this.s(60); // Reduced row spacing for shorter rows
        });
    }

    render() {
        // Add shadow def and clipPath
        this.elements.push(`<defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000" flood-opacity="0.1"/>
            </filter>
            <clipPath id="canvasClip">
                <rect x="0" y="0" width="${this.width}" height="${this.height}" rx="0" ry="0" />
            </clipPath>
        </defs>`);

        // Background
        this.elements.push(
            `<rect x="0" y="0" width="${this.width}" height="${this.height}" fill="#F4F6F9" />`
        );

        this.drawSidebar();

        const sidebarW = this.s(80); // Sidebar width
        const contentStartX = sidebarW + this.s(20); // Sidebar + margin

        // KPI Cards
        this.drawKPICards(contentStartX, this.s(20));

        // Analytics
        this.drawAnalytics(contentStartX, this.s(160));

        // Table
        this.drawTable(contentStartX, this.s(480));
    }

    getSvg(): string {
        return `
        <svg width="${this.width}" height="${this.height}" viewBox="0 0 ${
            this.width
        } ${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <clipPath id="canvasClip">
                    <rect x="0" y="0" width="${this.width}" height="${
            this.height
        }" rx="0" ry="0" />
                </clipPath>
            </defs>
            <g clip-path="url(#canvasClip)">
                ${this.elements.join("\n")}
            </g>
        </svg>
        `;
    }
}

async function drawInterface(
    inputPath: string,
    outputPath: string,
    rect: Rectangle,
    data: any,
    logoPath: string,
    userImagePath?: string,
    primaryColor: string = "#17A2B8"
) {
    // Load logo
    let logoData;
    try {
        const logoImage = sharp(logoPath);
        const metadata = await logoImage.metadata();
        const buffer = await logoImage.toBuffer();
        if (metadata.width && metadata.height) {
            logoData = {
                base64: `data:image/png;base64,${buffer.toString("base64")}`,
                width: metadata.width,
                height: metadata.height,
            };
        }
    } catch (error) {
        console.warn(`Failed to load logo image from ${logoPath}:`, error);
    }

    // Load user image (for bottom of sidebar)
    let userImageData;
    if (userImagePath) {
        try {
            const userImage = sharp(userImagePath);
            const userMetadata = await userImage.metadata();
            const userBuffer = await userImage.toBuffer();
            if (userMetadata.width && userMetadata.height) {
                userImageData = {
                    base64: `data:image/png;base64,${userBuffer.toString(
                        "base64"
                    )}`,
                    width: userMetadata.width,
                    height: userMetadata.height,
                };
            }
        } catch (error) {
            console.warn(
                `Failed to load user image from ${userImagePath}:`,
                error
            );
        }
    }

    let drawer;
    if (data.dashboard_interface) {
        drawer = new DashboardDrawer(
            rect.width,
            rect.height,
            data as DashboardData,
            primaryColor,
            logoData,
            userImageData
        );
    } else {
        drawer = new BookingFormDrawer(
            rect.width,
            rect.height,
            data as BookingFormData,
            logoData
        );
    }

    drawer.render();
    const svgContent = drawer.getSvg();

    const image = sharp(inputPath);

    // Composite the SVG onto the image
    await image
        .composite([
            {
                input: Buffer.from(svgContent),
                top: Math.round(rect.y),
                left: Math.round(rect.x),
            },
        ])
        .toFile(outputPath);

    console.log(`Processed image saved to ${outputPath}`);
}

async function main() {
    // Parse arguments
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.error(
            "Usage: ts-node src/dashboard_tablet.ts <input_image> <json_data> <logo_image> <user_image> [output_image]"
        );
        console.log(
            "Example: ts-node src/dashboard_tablet.ts test/input5.png test/data.json test/small_logo.png test/user_image.png test/output.png"
        );
        process.exit(1);
    }

    const inputPath = args[0]!;
    const jsonPath = args[1]!;
    const logoPath = args[2]!;
    const userImagePath = args[3]!;
    const outputPath = args[4] || "test/output_with_form.png";

    try {
        // Load composite JSON data (array with primaryColor, booking form, dashboard_interface)
        const jsonContent = fs.readFileSync(jsonPath, "utf-8");
        const parsed = JSON.parse(jsonContent);

        let primaryColor = "#17A2B8";
        let data: any = parsed;

        if (Array.isArray(parsed)) {
            parsed.forEach((obj: any) => {
                if (obj && typeof obj === "object") {
                    if ("primaryColor" in obj) {
                        primaryColor =
                            (obj as PrimaryConfig).primaryColor || primaryColor;
                    }
                    if ("dashboard_interface" in obj) {
                        data = obj;
                    }
                }
            });
        }

        // Margins: 4% sides/bottom, 7% top
        const margins: Margins = {
            top: 0,
            right: -0.001,
            bottom: -0.01,
            left: 0,
        };

        const rect = await detectScreenArea(inputPath, margins);
        console.log(
            `Detected area: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`
        );

        await drawInterface(
            inputPath,
            outputPath,
            rect,
            data,
            logoPath,
            userImagePath,
            primaryColor
        );
    } catch (error) {
        console.error("Error processing image:", error);
    }
}

main();
