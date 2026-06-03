import type { AiBrandPageLike, CdpSessionLike, Resolution, ScreenshotData, Stylesheet } from '../types.js';

export class CssCollector {
    private constructor(
        private client: CdpSessionLike,
        private stylesheets: Stylesheet[] = [],
        private cssPromises: Promise<void>[] = []
    ) {}

    static async start(page: AiBrandPageLike): Promise<CssCollector> {
        const client = await page.createCDPSession();
        const collector = new CssCollector(client);

        await client.send('DOM.enable');
        await client.send('CSS.enable');

        client.on('CSS.styleSheetAdded', (event) => {
            const header = event.header;
            const promise = (async () => {
                try {
                    const { text } = await client.send('CSS.getStyleSheetText', {
                        styleSheetId: header.styleSheetId,
                    });
                    collector.stylesheets.push({
                        url: header.sourceURL || `inline-style-${header.styleSheetId}`,
                        content: text,
                    });
                } catch {
                    // Best effort: stylesheet text is sometimes unavailable for browser-generated sheets.
                }
            })();
            collector.cssPromises.push(promise);
        });

        return collector;
    }

    async getCss(): Promise<Stylesheet[]> {
        await Promise.all(this.cssPromises);
        return this.stylesheets;
    }

    async dispose(): Promise<void> {
        try {
            await this.client.detach();
        } catch {
            // The page may already be closing; no cleanup action is needed then.
        }
    }
}

export async function getFinalHtml(page: AiBrandPageLike, timeoutMs = 15000): Promise<string> {
    try {
        return await Promise.race([
            page.content(),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout of ${timeoutMs}ms exceeded`)), timeoutMs)
            ),
        ]);
    } catch {
        try {
            return await Promise.race([
                page.evaluate(() => document.documentElement.outerHTML),
                new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error('Fallback JS evaluation timed out')), 5000)
                ),
            ]);
        } catch (fallbackError: any) {
            throw new Error(`Failed to get page content: ${fallbackError.message}`);
        }
    }
}

export async function takeScreenshots(
    page: AiBrandPageLike,
    resolutions: Resolution[]
): Promise<ScreenshotData[]> {
    const screenshots: ScreenshotData[] = [];

    for (const resolution of resolutions) {
        const currentViewport = page.viewport();
        if (!currentViewport || currentViewport.width !== resolution.width || currentViewport.height !== resolution.height) {
            await page.setViewport(resolution);
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const screenshotData = await page.screenshot({
            fullPage: true,
            type: 'jpeg',
            quality: 80,
            encoding: 'base64',
        });
        const base64 = typeof screenshotData === 'string'
            ? screenshotData
            : Buffer.from(screenshotData).toString('base64');
        screenshots.push({
            resolution,
            screenshotBase64: `data:image/jpeg;base64,${base64}`,
        });
    }

    return screenshots;
}

export async function fetchFavicons(url: string, page: AiBrandPageLike): Promise<string[]> {
    try {
        const favicons = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('link[rel*="icon"]'));
            return links.map(link => (link as HTMLLinkElement).href).filter(href => href);
        });

        try {
            const urlObj = new URL(url);
            favicons.push(new URL('/favicon.ico', urlObj.origin).href);
        } catch {}

        return [...new Set(favicons)];
    } catch {
        return [];
    }
}
