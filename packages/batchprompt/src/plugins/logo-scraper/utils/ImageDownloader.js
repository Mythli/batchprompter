import sharp from "sharp";
import ico from 'sharp-ico';
const SVG_RASTER_DENSITY = 300;
const MAX_OUTPUT_DIMENSION = 1024;
export class ImageDownloader {
    fetcher;
    constructor(fetcher) {
        this.fetcher = fetcher;
    }
    async downloadAndProcess(urlOrDataUri) {
        try {
            let imageBuffer;
            let httpContentType = null;
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
                }
                else {
                    imageBuffer = Buffer.from(decodeURIComponent(data));
                }
            }
            else {
                const response = await this.fetcher(urlOrDataUri);
                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
                httpContentType = response.headers.get('content-type');
            }
            let imageProcessor;
            let originalFileType;
            let contentTypeFromFile;
            if (httpContentType) {
                const typeParts = httpContentType.split('/');
                if (typeParts[0] === 'image' && typeParts[1]) {
                    contentTypeFromFile = typeParts[1].split('+')[0];
                }
            }
            const isIco = (httpContentType && (httpContentType.includes('x-icon') || httpContentType.includes('vnd.microsoft.icon'))) ||
                (!isDataUri && urlOrDataUri.toLowerCase().endsWith('.ico'));
            if (isIco) {
                originalFileType = 'ico';
                const sharpInstances = ico.sharpsFromIco(imageBuffer).filter((instance) => 'metadata' in instance);
                if (sharpInstances.length === 0) {
                    throw new Error(`ICO file from ${urlOrDataUri} contains no processable sharp images.`);
                }
                let largestInstance;
                let maxPixels = 0;
                for (const instance of sharpInstances) {
                    const metadata = await instance.metadata();
                    const pixels = (metadata.width || 0) * (metadata.height || 0);
                    if (pixels > maxPixels) {
                        maxPixels = pixels;
                        largestInstance = instance;
                    }
                }
                imageProcessor = largestInstance || sharpInstances[0];
            }
            else {
                try {
                    const originalMetadata = await sharp(imageBuffer).metadata();
                    originalFileType = originalMetadata.format;
                }
                catch (metaError) {
                    originalFileType = contentTypeFromFile;
                }
                if (!originalFileType) {
                    originalFileType = 'unknown';
                }
                if (originalFileType === 'svg') {
                    imageProcessor = sharp(imageBuffer, {
                        density: SVG_RASTER_DENSITY
                    });
                }
                else {
                    imageProcessor = sharp(imageBuffer);
                }
            }
            imageProcessor.resize({
                width: MAX_OUTPUT_DIMENSION,
                height: MAX_OUTPUT_DIMENSION,
                fit: 'inside',
                withoutEnlargement: true,
            });
            const pngBuffer = await imageProcessor
                .png({ adaptiveFiltering: true })
                .trim()
                .toBuffer();
            const pngMetadata = await sharp(pngBuffer).metadata();
            return {
                originalUrl: urlOrDataUri,
                base64PngData: `data:image/png;base64,${pngBuffer.toString('base64')}`,
                originalFileType,
                outputMimeType: 'image/png',
                width: pngMetadata.width,
                height: pngMetadata.height,
                outputPngFileSize: pngBuffer.length,
            };
        }
        catch (error) {
            const source = urlOrDataUri.length > 100 ? urlOrDataUri.substring(0, 100) + '...' : urlOrDataUri;
            throw new Error(`Error processing ${source}: ${error.message}`);
        }
    }
}
//# sourceMappingURL=ImageDownloader.js.map