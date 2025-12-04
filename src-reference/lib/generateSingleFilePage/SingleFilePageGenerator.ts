import { PuppeteerPageHelper } from '../PupeteerPageHelper.js';
import {processCssAndInlineUrls} from "./processCssAndInlineUrls.js";
import {
    FetchAndCreateDataUriFunction
} from "./fetchAndCreateBase64DataUri.js";
import { PuppeteerHelper } from '../PuppeteerHelper.js';
import * as fs from "fs/promises";
import * as path from "path";
import parseSrcset from './parseSrcSet.js';


export type SingleFilePageInput =
    | string // url
    | { type: 'url'; value: string }
    | { type: 'html'; value: string; baseUrl: string };

type CreateDataUriFn = (pageHelper: PuppeteerPageHelper) => FetchAndCreateDataUriFunction;

export type SingleFilePageGeneratorDependencies = {
    puppeteerHelper: PuppeteerHelper;
    createDataUriFn: CreateDataUriFn;
};

export type GenerateSingleFilePageFunction = (input: SingleFilePageInput) => Promise<PuppeteerPageHelper>;

export class SingleFilePageGenerator {
    private puppeteerHelper: PuppeteerHelper;
    private readonly createDataUriFn: CreateDataUriFn;

    constructor(dependencies: SingleFilePageGeneratorDependencies) {
        this.puppeteerHelper = dependencies.puppeteerHelper;
        this.createDataUriFn = dependencies.createDataUriFn;
    }

    /**
     * Normalizes the various input types into a consistent format by loading the content
     * into the Puppeteer page.
     * If the input is a URL, it navigates to it. If it's HTML, it sets the page content.
     * @param input The input to normalize.
     * @param pageHelper The page helper instance to use.
     * @returns A promise that resolves to an object with the final baseUrl.
     * @private
     */
    private async _normalizeInput(
        input: SingleFilePageInput,
        pageHelper: PuppeteerPageHelper
    ): Promise<{ baseUrl: string }> {
        const page = pageHelper.getPage();

        // CRITICAL: Disable JavaScript execution to prevent scripts from running during the inlining process.
        await page.setJavaScriptEnabled(false);
        console.log('[Inliner] JavaScript execution disabled.');

        if (typeof input === 'string' || input.type === 'url') {
            const url = typeof input === 'string' ? input : input.value;
            console.log(`[Inliner] Starting process for URL: ${url}`);
            // Use 'domcontentloaded' as we don't need to wait for scripts or resources.
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            const baseUrl = page.url(); // Use final URL after any redirects
            return { baseUrl };
        } else if (input.type === 'html') {
            console.log(`[Inliner] Starting process for provided HTML with base URL: ${input.baseUrl}`);
            // 'domcontentloaded' is the default wait condition for setContent.
            await page.setContent(input.value);
            // For raw HTML input, the provided baseUrl is the source of truth for resolving relative paths.
            return { baseUrl: input.baseUrl };
        } else {
            // This case is for type safety, should not be reachable if input conforms to SingleFilePageInput
            throw new Error('Invalid input type for generateSingleFilePage');
        }
    }

    /**
     * Inlines external stylesheets and processes URLs within existing <style> tags.
     * @private
     */
    private async _inlineStylesheets(
        pageHelper: PuppeteerPageHelper,
        baseUrl: string,
        baseOrigin: string,
        fetchAndCreateDataUri: FetchAndCreateDataUriFunction
    ) {
        const page = pageHelper.getPage();

        // Part 1: Inline external stylesheets (<link rel="stylesheet">)
        const stylesheetHrefs = await page.$$eval('link[rel="stylesheet"]', links =>
            links.map(link => ({ href: (link as HTMLLinkElement).href, originalHref: link.getAttribute('href') }))
        );

        const linkTasks = stylesheetHrefs.map(async ({ href, originalHref }) => {
            if (!href || href.startsWith('data:')) return;

            try {
                const cssUrl = new URL(href, baseUrl);

                if (cssUrl.origin !== baseOrigin) {
                    console.log(`[HTML Processor] Skipping cross-origin stylesheet: ${cssUrl.href}`);
                    await page.evaluate((origHref, newHref) => {
                        const link = document.querySelector(`link[rel="stylesheet"][href="${origHref}"]`);
                        if (link) (link as HTMLLinkElement).href = newHref;
                    }, originalHref, cssUrl.href);
                    return;
                }

                console.log(`[HTML Processor] Inlining external stylesheet: ${cssUrl.href}`);
                const cssResponse = await pageHelper.fetchResourceAsDataWithCache(cssUrl.href);
                const cssText = await cssResponse.text();
                const inlinedCss = await processCssAndInlineUrls(cssText, cssUrl.href, fetchAndCreateDataUri, 'stylesheet');

                await page.evaluate((origHref, cssContent) => {
                    const link = document.querySelector(`link[rel="stylesheet"][href="${origHref}"]`);
                    if (link) {
                        const style = document.createElement('style');
                        style.textContent = cssContent;
                        link.parentNode?.replaceChild(style, link);
                    }
                }, originalHref, inlinedCss);
            } catch (e: any) { console.error(`Failed to inline stylesheet ${originalHref}: ${e.message}`); }
        });

        // Part 2: Process existing <style> tags
        const styleTagsInfo = await page.evaluate(() =>
            Array.from(document.querySelectorAll('style')).map((style, i) => {
                const id = `data-inliner-id-${i}`;
                style.setAttribute(id, '');
                return { id, content: style.innerHTML };
            })
        );

        const styleTagTasks = styleTagsInfo.map(async ({ id, content }) => {
            if (!content) return;
            try {
                console.log(`[HTML Processor] Processing existing <style> tag content...`);
                const inlinedContent = await processCssAndInlineUrls(content, baseUrl, fetchAndCreateDataUri, 'stylesheet');
                await page.evaluate((tagId, newContent) => {
                    const styleElement = document.querySelector(`style[${tagId}]`);
                    if (styleElement) styleElement.innerHTML = newContent;
                }, id, inlinedContent);
            } catch (e: any) { console.error(`Failed to process existing <style> tag content: ${e.message}`); }
        });

        await Promise.all([...linkTasks, ...styleTagTasks]);

        await page.evaluate(() => document.querySelectorAll('[data-inliner-id]').forEach(el => el.removeAttribute('data-inliner-id')));
    }

    /**
     * Inlines external JavaScript files.
     * @private
     */
    private async _inlineScripts(
        pageHelper: PuppeteerPageHelper,
        baseUrl: string,
        baseOrigin: string,
        fetchAndCreateDataUri: FetchAndCreateDataUriFunction
    ) {
        const page = pageHelper.getPage();

        const scriptSrcs = await page.$$eval('script[src]', scripts =>
            scripts.map(script => ({ src: (script as HTMLScriptElement).src, originalSrc: script.getAttribute('src') }))
        );

        const scriptTasks = scriptSrcs.map(async ({ src, originalSrc }) => {
            if (!src || src.startsWith('data:')) return;

            try {
                const jsUrl = new URL(src, baseUrl);
                if (jsUrl.origin !== baseOrigin) {
                    console.log(`[HTML Processor] Skipping cross-origin script: ${jsUrl.href}`);
                    // Ensure the src is absolute for correctness
                    await page.evaluate((origSrc, newSrc) => {
                        const script = document.querySelector(`script[src="${origSrc}"]`);
                        if (script) (script as HTMLScriptElement).src = newSrc;
                    }, originalSrc, jsUrl.href);
                    return;
                }

                console.log(`[HTML Processor] Inlining script: ${jsUrl.href}`);
                const dataUri = await fetchAndCreateDataUri(jsUrl.href);

                await page.evaluate((origSrc, newSrc) => {
                    const script = document.querySelector(`script[src="${origSrc}"]`);
                    if (script) {
                        script.setAttribute('src', newSrc);
                    }
                }, originalSrc, dataUri);

            } catch (e: any) {
                console.error(`Failed to inline script ${originalSrc}: ${e.message}`);
            }
        });

        await Promise.all(scriptTasks);
    }

    /**
     * Inlines media assets like images and videos.
     * @private
     */
    private async _inlineMedia(
        pageHelper: PuppeteerPageHelper,
        baseUrl: string,
        baseOrigin: string,
        fetchAndCreateDataUri: FetchAndCreateDataUriFunction
    ) {
        const page = pageHelper.getPage();

        const mediaElements = await page.evaluate(() =>
            Array.from(document.querySelectorAll('img, source, video')).map((el, i) => {
                const id = `data-inliner-media-id-${i}`;
                el.setAttribute(id, '');
                return {
                    id,
                    src: el.getAttribute('src'),
                    srcset: el.getAttribute('srcset'),
                    poster: el.getAttribute('poster'),
                };
            })
        );

        const mediaTasks = mediaElements.map(async (elData) => {
            const attrsToUpdate: { [key: string]: string } = {};
            const attributePromises: Promise<void>[] = [];

            // Process 'src' and 'poster' attributes in parallel
            for (const attr of ['src', 'poster']) {
                const value = elData[attr as keyof typeof elData] as string | null;
                if (!value || value.startsWith('data:')) continue;

                attributePromises.push((async () => {
                    try {
                        const absoluteUrl = new URL(value, baseUrl);
                        if (absoluteUrl.origin !== baseOrigin) {
                            attrsToUpdate[attr] = absoluteUrl.href;
                            return;
                        }
                        attrsToUpdate[attr] = await fetchAndCreateDataUri(absoluteUrl.href);
                    } catch (e: any) { console.error(`Failed to inline media attribute ${attr} for ${value}: ${e.message}`); }
                })());
            }

            // Process 'srcset' attribute in parallel
            const srcset = elData.srcset;
            if (srcset) {
                attributePromises.push((async () => {
                    try {
                        const candidates = parseSrcset(srcset);
                        const newSrcsetParts = await Promise.all(
                            candidates.map(async (candidate) => {
                                const url = candidate.source.value;

                                const getDescriptor = () => {
                                    if (candidate.width?.value) return `${candidate.width.value}w`;
                                    if (candidate.density?.value) return `${candidate.density.value}x`;
                                    return '';
                                };
                                const descriptor = getDescriptor();

                                if (!url || url.startsWith('data:')) {
                                    return `${url} ${descriptor}`.trim();
                                }

                                try {
                                    const absoluteUrl = new URL(url, baseUrl);

                                    if (absoluteUrl.origin !== baseOrigin) {
                                        return `${absoluteUrl.href} ${descriptor}`.trim();
                                    }

                                    const dataUri = await fetchAndCreateDataUri(absoluteUrl.href);
                                    return `${dataUri} ${descriptor}`.trim();
                                } catch (e: any) {
                                    console.error(`Failed to inline srcset resource "${url}". Removing from set. Error: ${e.message}`);
                                    return null; // Return null on failure, to be filtered out later
                                }
                            })
                        );

                        // Filter out failed (null) parts and join the rest.
                        const finalSrcset = newSrcsetParts.filter(p => p !== null).join(', ');
                        attrsToUpdate['srcset'] = finalSrcset;
                    } catch (e: any) {
                        console.error(`Failed to parse or process srcset attribute: "${srcset}". Error: ${e.message}`);
                    }
                })());
            }

            await Promise.all(attributePromises);

            if (Object.keys(attrsToUpdate).length > 0) {
                await page.evaluate((id, updates) => {
                    const el = document.querySelector(`[${id}]`);
                    if (el) Object.entries(updates).forEach(([attr, val]) => el.setAttribute(attr, val));
                }, elData.id, attrsToUpdate);
            }
        });

        await Promise.all(mediaTasks);
        await page.evaluate(() => document.querySelectorAll('[data-inliner-media-id]').forEach(el => el.removeAttribute('data-inliner-media-id')));
    }

    /**
     * Inlines URLs found within inline `style` attributes.
     * @private
     */
    private async _inlineStyleAttributes(
        pageHelper: PuppeteerPageHelper,
        baseUrl: string,
        fetchAndCreateDataUri: FetchAndCreateDataUriFunction
    ) {
        const page = pageHelper.getPage();

        const elementsWithStyle = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[style]')).map((el, i) => {
                const id = `data-inliner-style-id-${i}`;
                el.setAttribute(id, '');
                return { id, style: el.getAttribute('style') };
            })
        );

        const styleAttrTasks = elementsWithStyle.map(async ({ id, style }) => {
            if (!style) return;
            try {
                const newStyle = await processCssAndInlineUrls(style, baseUrl, fetchAndCreateDataUri, 'declarationList');
                await page.evaluate((tagId, newStyleAttr) => {
                    const el = document.querySelector(`[${tagId}]`);
                    if (el) el.setAttribute('style', newStyleAttr);
                }, id, newStyle);
            } catch(e: any) { console.error(`Failed to process style attribute: ${e.message}`); }
        });

        await Promise.all(styleAttrTasks);
        await page.evaluate(() => document.querySelectorAll('[data-inliner-style-id]').forEach(el => el.removeAttribute('data-inliner-style-id')));
    }

    /**
     * Converts relative navigational links (<a>, <form>) to absolute URLs.
     * @private
     */
    private async _makeNavigationalLinksAbsolute(
        pageHelper: PuppeteerPageHelper,
        baseUrl: string
    ) {
        const page = pageHelper.getPage();

        console.log('[HTML Processor] Converting navigational links to absolute URLs.');
        await page.evaluate((pageBaseUrl) => {
            document.querySelectorAll('a[href], form[action]').forEach(element => {
                const el = element as HTMLAnchorElement | HTMLFormElement;
                const attrName = el.tagName.toLowerCase() === 'a' ? 'href' : 'action';
                const relativeUrl = el.getAttribute(attrName);

                if (!relativeUrl || /^(mailto|tel|javascript|#|data:)/.test(relativeUrl) || /^(https?:)?\/\//.test(relativeUrl)) {
                    return;
                }
                try {
                    const absoluteUrl = new URL(relativeUrl, pageBaseUrl).href;
                    el.setAttribute(attrName, absoluteUrl);
                } catch (e) { /* Ignore invalid URLs */ }
            });
        }, baseUrl);
    }

    public async generate(input: SingleFilePageInput): Promise<PuppeteerPageHelper> {
        const pageHelper = await this.puppeteerHelper.getPageHelper();
        const page = pageHelper.getPage();

        // Load the page content with JS disabled to prevent original scripts from running.
        const { baseUrl } = await this._normalizeInput(input, pageHelper);

        // Re-enable JavaScript to allow our own DOM manipulation scripts to run.
        await page.setJavaScriptEnabled(true);
        console.log('[Inliner] JavaScript re-enabled for DOM processing.');

        const baseOrigin = new URL(baseUrl).origin;
        const fetchAndCreateDataUri = this.createDataUriFn(pageHelper);

        // Prepare the document for inlining.
        await page.evaluate(() => document.querySelector('base')?.remove());

        console.log('[Inliner] Starting parallel processing of resources...');

        // --- Process all resources in parallel ---
        await Promise.all([
            this._inlineStylesheets(pageHelper, baseUrl, baseOrigin, fetchAndCreateDataUri),
            this._inlineScripts(pageHelper, baseUrl, baseOrigin, fetchAndCreateDataUri),
            this._inlineMedia(pageHelper, baseUrl, baseOrigin, fetchAndCreateDataUri),
            this._inlineStyleAttributes(pageHelper, baseUrl, fetchAndCreateDataUri),
            this._makeNavigationalLinksAbsolute(pageHelper, baseUrl)
        ]);

        // --- Finalization ---
        console.log('[Inliner] All processing complete. Returning page helper for further use.');
        return pageHelper;
    }
}
