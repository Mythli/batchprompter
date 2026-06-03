import * as cheerio from 'cheerio';


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
 * - Removing <script>, <style>, <noscript>, <iframe> tags.
 * - Removing <link rel="stylesheet"> tags.
 * - Removing HTML comments.
 * - Truncating `src`, `srcset`, and `href` attributes that contain long data URIs.
 *   By default, it preserves SVG data URIs up to 4096 characters.
 * - Collapsing whitespace.
 *
 * @param html The raw HTML string to compress.
 * @param options Optional configuration for compression behavior.
 * @returns A compressed HTML string.
 */
export function compressHtml(html: string, options: CompressHtmlOptions = {}): string {
    if (!html) {
        return '';
    }

    const {
        maxSvgDataUriLength = 4096,
        maxOtherDataUriLength = 80,
        maxAttributeLength = 256,
    } = options;

    // Note: This function requires the 'cheerio' package.
    // Please install it using: npm install cheerio
    const $ = cheerio.load(html);

    // 1. Remove scripts, styles, noscripts, and iframes from anywhere in the document
    $('script, style, noscript, iframe').remove();

    // 2. Remove stylesheets
    $('link[rel="stylesheet"]').remove();

    // 3. Remove all HTML comments
    $('*').contents().filter(function(this: any) {
        return this.type === 'comment';
    }).remove();

    // 4. Process attributes to shorten long values
    $('*').each((_: any, element: any) => {
        const el = $(element);
        // @ts-ignore
        if (!element.attribs) {
            return;
        }

        // @ts-ignore
        for (const attrName in element.attribs) {
            const attrValue = el.attr(attrName);
            if (attrValue) {
                // Handle data URIs
                if ((attrName === 'src' || attrName === 'href' || attrName === 'srcset') && attrValue.startsWith('data:')) {
                    if (attrValue.startsWith('data:image/svg+xml')) {
                        if (attrValue.length > maxSvgDataUriLength) {
                            el.attr(attrName, attrValue.substring(0, maxSvgDataUriLength) + '...[truncated]');
                        }
                    } else {
                        if (attrValue.length > maxOtherDataUriLength) {
                            el.attr(attrName, attrValue.substring(0, maxOtherDataUriLength) + '...[truncated]');
                        }
                    }
                }
                // Truncate any other very long attribute
                else if (attrValue.length > maxAttributeLength) {
                     el.attr(attrName, attrValue.substring(0, maxAttributeLength) + '...[truncated]');
                }
            }
        }
    });

    // 5. Serialize back to string. Cheerio's default serialization is compact.
    let compressed = $.html();

    // Aggressively collapse whitespace between tags
    compressed = compressed.replace(/>\s+</g, '><');
    // Trim whitespace at the start and end of the document
    compressed = compressed.trim();

    return compressed;
}
