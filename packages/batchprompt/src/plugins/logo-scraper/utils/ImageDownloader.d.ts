import { Fetcher } from "llm-fns";
export interface ImageConversionResult {
    originalUrl: string;
    base64PngData: string;
    originalFileType: string | undefined;
    outputMimeType: 'image/png';
    width: number | undefined;
    height: number | undefined;
    outputPngFileSize: number;
}
export declare class ImageDownloader {
    private fetcher;
    constructor(fetcher: Fetcher);
    downloadAndProcess(urlOrDataUri: string): Promise<ImageConversionResult>;
}
//# sourceMappingURL=ImageDownloader.d.ts.map