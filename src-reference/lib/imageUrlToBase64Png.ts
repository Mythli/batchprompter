import sharp from "sharp";
import ico from 'sharp-ico';
import { Fetcher } from "./createCachedFetcher.js";

// The ImageConversionResult interface remains unchanged
export interface ImageConversionResult {
    originalUrl: string;
    base64PngData: string; // Data URI for the PNG image
    originalFileType: string | undefined; // e.g., 'jpeg', 'gif', 'svg', 'webp'
    outputMimeType: 'image/png'; // Always image/png for this function
    width: number | undefined; // Width of the output PNG
    height: number | undefined; // Height of the output PNG
    outputPngFileSize: number; // File size of the generated PNG in bytes
}

// --- Dynamic Quality Constants ---

/**
 * The density (DPI) at which to rasterize SVGs.
 * Standard screen density is 72 or 96. Higher values produce a sharper,
 * larger PNG image from the vector source. 300 is a good "print quality" baseline.
 */
const SVG_RASTER_DENSITY = 300;

/**
 * A safety limit to prevent extremely large images from being processed,
 * which could lead to out-of-memory errors. The image will be scaled down
 * to fit within these dimensions if it's larger.
 */
const MAX_OUTPUT_DIMENSION = 4096;

export type ImageUrlToBase64PngDependencies = {
    fetcher: Fetcher;
};

export type ImageUrlToBase64PngFunction = (urlOrDataUri: string) => Promise<ImageConversionResult>;


export function createImageUrlToBase64Png(dependencies: ImageUrlToBase64PngDependencies): ImageUrlToBase64PngFunction {
    const { fetcher } = dependencies;

    async function imageUrlToBase64Png(urlOrDataUri: string): Promise<ImageConversionResult> {
        try {
            let imageBuffer: Buffer;
            let httpContentType: string | null = null;
            const isDataUri = urlOrDataUri.startsWith('data:');

            if (isDataUri) {
                const match = urlOrDataUri.match(/^data:([^;,]+)(;base64)?,(.*)$/);
                if (!match) {
                    throw new Error('Invalid or unsupported data URI format');
                }
                const [, mimeType, base64Marker, data] = match;
                if (mimeType === undefined || data === undefined) {
                    throw new Error('Invalid or unsupported data URI format: malformed data URI.');
                }
                httpContentType = mimeType;

                if (base64Marker) {
                    imageBuffer = Buffer.from(data, 'base64');
                } else {
                    // For URI-encoded data, like SVGs from `src` attributes
                    imageBuffer = Buffer.from(decodeURIComponent(data));
                }
            } else {
                const response = await fetcher(urlOrDataUri);

                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
                httpContentType = response.headers.get('content-type');
            }

            let imageProcessor: sharp.Sharp;
            let originalFileType: string | undefined;

            // First, derive file type from content-type header if available
            let contentTypeFromFile: string | undefined;
            if (httpContentType) {
                const typeParts = httpContentType.split('/');
                if (typeParts[0] === 'image' && typeParts[1]) {
                    contentTypeFromFile = typeParts[1].split('+')[0]; // e.g. svg+xml -> svg
                }
            }

            // ICO files need special handling as they can contain multiple images.
            // We detect them by content type or file extension.
            const isIco = (httpContentType && (httpContentType.includes('x-icon') || httpContentType.includes('vnd.microsoft.icon'))) ||
                          (!isDataUri && urlOrDataUri.toLowerCase().endsWith('.ico'));

            if (isIco) {
                originalFileType = 'ico';
                // sharpsFromIco can return a mix of sharp instances and browser ImageData.
                // We filter to only keep the sharp instances which we can process in Node.js.
                const sharpInstances = ico.sharpsFromIco(imageBuffer).filter(
                    (instance): instance is sharp.Sharp => 'metadata' in instance
                );

                if (sharpInstances.length === 0) {
                    throw new Error(`ICO file from ${urlOrDataUri} contains no processable sharp images.`);
                }

                // Find the sharp instance for the largest image in the ICO file.
                let largestInstance: sharp.Sharp | undefined;
                let maxPixels = 0;

                for (const instance of sharpInstances) {
                    // The instances from sharpsFromIco are ready to use.
                    // We need their metadata to find the largest one.
                    const metadata = await instance.metadata();
                    const pixels = (metadata.width || 0) * (metadata.height || 0);
                    if (pixels > maxPixels) {
                        maxPixels = pixels;
                        largestInstance = instance;
                    }
                }
                
                // Fallback to the first image if we couldn't determine the largest.
                imageProcessor = largestInstance || sharpInstances[0]!;

            } else {
                // This is the logic for non-ICO files.
                try {
                    const originalMetadata = await sharp(imageBuffer).metadata();
                    originalFileType = originalMetadata.format;
                } catch (metaError) {
                    console.warn(`Sharp couldn't determine original format for ${urlOrDataUri}: ${(metaError as Error).message}. Falling back to Content-Type.`);
                    originalFileType = contentTypeFromFile;
                }

                if (!originalFileType) { originalFileType = 'unknown'; }

                // Initialize sharp with special high-density settings for SVGs
                if (originalFileType === 'svg') {
                    imageProcessor = sharp(imageBuffer, {
                        density: SVG_RASTER_DENSITY
                    });
                } else {
                    imageProcessor = sharp(imageBuffer);
                }
            }

            // --- DYNAMIC PROCESSING PIPELINE (now common for all types) ---

            // Add a safety resize operation to cap the maximum output dimension
            // This prevents memory issues and applies to all image types.
            // `withoutEnlargement` ensures small images aren't stretched.
            imageProcessor.resize({
                width: MAX_OUTPUT_DIMENSION,
                height: MAX_OUTPUT_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            });

            // Convert the final processed image to a PNG buffer
            const pngBuffer = await imageProcessor
                .png({
                    // Using 'adaptiveFiltering' can sometimes reduce PNG file size
                    adaptiveFiltering: true,
                })
                .trim()
                .toBuffer();

            // 5. Get metadata of the final PNG
            const pngMetadata = await sharp(pngBuffer).metadata();

            const width = pngMetadata.width;
            const height = pngMetadata.height;
            const outputPngFileSize = pngBuffer.length;

            const base64PngData = `data:image/png;base64,${pngBuffer.toString('base64')}`;

            return {
                originalUrl: urlOrDataUri,
                base64PngData,
                originalFileType,
                outputMimeType: 'image/png',
                width,
                height,
                outputPngFileSize,
            };

        } catch (error: any) {
            const source = urlOrDataUri.length > 100 ? urlOrDataUri.substring(0, 100) + '...' : urlOrDataUri;
            const errorMessage = error.message || 'Unknown error';
            const errorName = (error.name && error.name !== 'Error') ? ` (${error.name})` : '';
            throw new Error(`Error processing ${source}${errorName}: ${errorMessage}`);
        }
    }
    return imageUrlToBase64Png;
}

export type Base64PngInfo = Awaited<ReturnType<ImageUrlToBase64PngFunction>>;
