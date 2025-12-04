import * as csstree from 'css-tree';
import { FetchAndCreateDataUriFunction } from "./fetchAndCreateBase64DataUri.js";

/**
 * Processes any block of CSS, recursively inlining `url()`.
 * This is the corrected version that handles all possible AST structures for Url nodes.
 */
export async function processCssAndInlineUrls(
    cssContent: string,
    cssBaseUrl: string, // This is the URL of the CSS file or the HTML page
    fetchAndCreateDataUri: FetchAndCreateDataUriFunction,
    context: 'stylesheet' | 'declarationList' = 'stylesheet',
): Promise<string> {
    if (!cssContent) return '';

    const ast = csstree.parse(cssContent, {
        context,
        onParseError: (e) => console.warn(`CSS Parse Error: ${e.message}`)
    });
    const promises: Promise<void>[] = [];
    const baseOrigin = new URL(cssBaseUrl).origin; // Get the origin of the CSS file itself.

    csstree.walk(ast, {
        visit: 'Url',
        enter: function(urlNode: csstree.Url) {
            const originalUrl = urlNode.value;

            // The rest of the logic remains the same.
            if (!originalUrl || originalUrl.startsWith('data:')) {
                return; // Already inlined or empty
            }

            const promise = (async () => {
                try {
                    const absoluteAssetUrl = new URL(originalUrl, cssBaseUrl).href;

                    // **SECURITY/SCOPE CHECK**: Only inline assets from the same origin as the CSS file.
                    if (new URL(absoluteAssetUrl).origin !== baseOrigin) {
                        console.log(`[CSS Processor] Skipping cross-origin asset: ${absoluteAssetUrl}`);
                        // Update the node to have the absolute URL instead of a relative one.
                        urlNode.value = absoluteAssetUrl;
                        return;
                    }

                    const dataUri = await fetchAndCreateDataUri(absoluteAssetUrl);

                    // Replace the URL's value with a Raw node containing the data URI.
                    // This is robust and works regardless of the original type.
                    urlNode.value = dataUri;

                } catch (error: any) {
                    console.error(`[CSS Inliner] Failed to inline ${originalUrl} from ${cssBaseUrl}: ${error.message}. Keeping original.`);
                }
            })();

            promises.push(promise);
        }
    });

    await Promise.all(promises);
    return csstree.generate(ast);
}
