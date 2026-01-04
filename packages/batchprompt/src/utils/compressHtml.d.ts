export interface CompressHtmlOptions {
    /**
     * The maximum length for an SVG data URI before it is truncated.
     * Defaults to 4096.
     */
    maxSvgDataUriLength?: number;
    /**
     * The maximum length for other (non-SVG) data URIs before they are truncated.
     * Defaults to 80.
     */
    maxOtherDataUriLength?: number;
    /**
     * The maximum length for any other attribute before it is truncated.
     * Defaults to 256.
     */
    maxAttributeLength?: number;
}
/**
 * Compresses an HTML string by removing non-essential content for LLM analysis,
 * while preserving the DOM structure and selectors.
 *
 * This function aims to reduce the size of the HTML to lower token usage when
 * sending it to a Large Language Model, focusing on structural modifications.
 *
 * The compression includes:
 * - Removing the entire <head> tag.
 * - Removing <script> and <style> tags from the body.
 * - Removing HTML comments.
 * - Truncating `src`, `srcset`, and `href` attributes that contain long data URIs.
 *   By default, it preserves SVG data URIs up to 4096 characters.
 * - Collapsing whitespace.
 *
 * @param html The raw HTML string to compress.
 * @param options Optional configuration for compression behavior.
 * @returns A compressed HTML string.
 */
export declare function compressHtml(html: string, options?: CompressHtmlOptions): string;
//# sourceMappingURL=compressHtml.d.ts.map