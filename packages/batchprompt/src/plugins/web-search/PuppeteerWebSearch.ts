import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import type { Fetcher } from 'llm-fns';
import type { Page } from 'puppeteer';
import { PuppeteerHelper } from '../../utils/puppeteer/PuppeteerHelper.js';
import {
    BaseWebSearchProvider,
    WebSearchResult
} from './WebSearchProvider.js';

const GOOGLE_SEARCH_URL = 'https://www.google.com/search';
const GOOGLE_RESULT_SELECTOR = '#search a:has(h3), #rso a:has(h3)';
const TOP_AD_SELECTOR = '#tads [data-text-ad], #tads .uEierd, #tads [data-rw]';
const BOTTOM_AD_SELECTOR = '#tadsb [data-text-ad], #tadsb .uEierd, #tadsb [data-rw]';

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function isGoogleHost(hostname: string): boolean {
    return hostname === 'google.com'
        || hostname.endsWith('.google.com')
        || /^(.+\.)?google\.[a-z.]+$/i.test(hostname);
}

export function normalizeGoogleResultLink(rawLink: string): string | null {
    if (!rawLink || rawLink.startsWith('#') || rawLink.startsWith('javascript:')) {
        return null;
    }

    try {
        const url = new URL(rawLink, GOOGLE_SEARCH_URL);
        if (isGoogleHost(url.hostname)) {
            const target = url.searchParams.get('adurl')
                || url.searchParams.get('url')
                || url.searchParams.get('q');

            if (target) {
                const targetUrl = new URL(target);
                if (['http:', 'https:'].includes(targetUrl.protocol)) {
                    return targetUrl.href;
                }
            }
        }

        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function findResultLink(
    $: cheerio.CheerioAPI,
    element: cheerio.Cheerio<any>,
    allowGoogleClickLink: boolean
): string | null {
    const linkCandidates = [
        element.attr('data-rw'),
        ...element.find('a[href]').toArray().map(anchor => $(anchor).attr('href'))
    ];

    let googleClickLink: string | null = null;
    for (const candidate of linkCandidates) {
        const link = normalizeGoogleResultLink(candidate || '');
        if (!link) continue;

        const parsed = new URL(link);
        if (!isGoogleHost(parsed.hostname)) return link;
        if (allowGoogleClickLink && /\/(?:aclk|pagead\/)/.test(parsed.pathname)) {
            googleClickLink ||= link;
        }
    }

    return googleClickLink;
}

function parseAds(
    $: cheerio.CheerioAPI,
    selector: string,
    startPosition: number,
    seenLinks: Set<string>
): WebSearchResult[] {
    const results: WebSearchResult[] = [];

    $(selector).each((_index, node) => {
        const element = $(node);
        const link = findResultLink($, element, true);
        if (!link || seenLinks.has(link)) return;

        const heading = element.find('[role="heading"], h3, .CCgQ5, .pO9jHb').first();
        let title = cleanText(heading.text());

        if (!title) {
            const candidate = element.find('a[href]').toArray()
                .map(anchor => cleanText($(anchor).text()))
                .find(text => text.length > 2 && !/^(sponsored|gesponsert|anzeige)$/i.test(text));
            title = candidate || '';
        }

        if (!title) return;

        const snippet = cleanText(
            element.find('.yXK7lf, .MUxGbd, .lyLwlc, .Va3FIb, [data-sncf]').first().text()
        );

        seenLinks.add(link);
        results.push({
            title,
            link,
            snippet: snippet || undefined,
            position: startPosition + results.length,
            type: 'ad'
        });
    });

    return results;
}

function parseOrganicResults(
    $: cheerio.CheerioAPI,
    num: number,
    startPosition: number,
    seenLinks: Set<string>
): WebSearchResult[] {
    const results: WebSearchResult[] = [];

    $(GOOGLE_RESULT_SELECTOR).each((_index, node) => {
        if (results.length >= num) return;

        const anchor = $(node);
        if (anchor.closest('#tads, #tadsb, [data-text-ad], .uEierd').length > 0) return;

        const link = normalizeGoogleResultLink(anchor.attr('href') || '');
        if (!link || seenLinks.has(link) || isGoogleHost(new URL(link).hostname)) return;

        const title = cleanText(anchor.find('h3').first().text());
        if (!title) return;

        const container = anchor.closest('.MjjYud, .g, [data-snhf]').first();
        const snippet = cleanText(
            container.find('.VwiC3b, [data-sncf], .yXK7lf, .MUxGbd').first().text()
        );

        seenLinks.add(link);
        results.push({
            title,
            link,
            snippet: snippet || undefined,
            position: startPosition + results.length,
            type: 'seo'
        });
    });

    return results;
}

export function parseGoogleSearchHtml(
    html: string,
    options: { num: number; page: number; includeAds: boolean }
): WebSearchResult[] {
    const $ = cheerio.load(html);
    const seenLinks = new Set<string>();
    const organicStart = (options.page - 1) * options.num + 1;

    const topAds = options.includeAds
        ? parseAds($, TOP_AD_SELECTOR, 1, seenLinks)
        : [];
    const organic = parseOrganicResults($, options.num, organicStart, seenLinks);
    const bottomAds = options.includeAds
        ? parseAds($, BOTTOM_AD_SELECTOR, topAds.length + 1, seenLinks)
        : [];

    return [...topAds, ...organic, ...bottomAds];
}

export class PuppeteerWebSearch extends BaseWebSearchProvider {
    readonly provider = 'puppeteer' as const;

    constructor(
        private readonly puppeteerHelper: PuppeteerHelper,
        fetcher: Fetcher,
        queue: PQueue
    ) {
        super(fetcher, queue);
    }

    private async acceptGoogleConsent(page: Page): Promise<void> {
        if (!page.url().includes('consent.google.')) return;

        const navigation = page.waitForNavigation({
            waitUntil: 'domcontentloaded',
            timeout: 15_000
        }).catch(() => null);

        const clicked = await page.evaluate(() => {
            const controls = Array.from(
                document.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"]')
            );
            const acceptAll = controls.find(control => {
                const label = [
                    control.textContent,
                    control.getAttribute('value'),
                    control.getAttribute('aria-label')
                ].filter(Boolean).join(' ').trim();

                return /accept all|alle akzeptieren/i.test(label);
            });

            if (!acceptAll) return false;
            acceptAll.click();
            return true;
        });

        if (clicked) await navigation;
    }

    async search(
        query: string,
        num: number = 5,
        page: number = 1,
        gl?: string,
        hl?: string,
        includeAds: boolean = false
    ): Promise<WebSearchResult[]> {
        const searchUrl = new URL(GOOGLE_SEARCH_URL);
        searchUrl.searchParams.set('q', query);
        searchUrl.searchParams.set('num', String(num));
        searchUrl.searchParams.set('start', String((page - 1) * num));
        if (gl) searchUrl.searchParams.set('gl', gl);
        if (hl) searchUrl.searchParams.set('hl', hl);

        const results = await this.queue.add(async () => {
            const pageHelper = await this.puppeteerHelper.getPageHelper();

            try {
                await pageHelper.navigateToUrl(searchUrl.href, {
                    dismissCookies: true
                });

                const browserPage = pageHelper.getPage();
                await this.acceptGoogleConsent(browserPage);
                await browserPage.waitForSelector('#search, #rso, #tads, #tadsb', {
                    timeout: 10_000
                }).catch(() => {});

                const html = await pageHelper.getFinalHtml();
                const parsed = parseGoogleSearchHtml(html, { num, page, includeAds });

                if (parsed.length === 0 && /unusual traffic|not a robot|captcha|consent\.google/i.test(html)) {
                    throw new Error('Google blocked the Puppeteer search with a consent or bot-verification page.');
                }

                return parsed;
            } finally {
                await pageHelper.close().catch(() => {});
            }
        });

        if (!results) {
            throw new Error('Puppeteer queue execution failed or returned undefined results.');
        }

        return results;
    }
}
