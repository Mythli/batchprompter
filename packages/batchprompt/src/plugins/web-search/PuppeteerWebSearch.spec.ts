import { describe, expect, it, vi } from 'vitest';
import PQueue from 'p-queue';
import {
    parseGoogleSearchHtml,
    PuppeteerWebSearch
} from './PuppeteerWebSearch.js';

const GOOGLE_RESULTS_HTML = `
<!doctype html>
<html>
  <body>
    <div id="tads">
      <div data-text-ad>
        <span>Sponsored</span>
        <a href="/aclk?adurl=https%3A%2F%2Fads.example%2Ftop">
          <div role="heading">Top sponsored result</div>
        </a>
        <div class="yXK7lf">Top ad copy</div>
      </div>
    </div>
    <div id="search">
      <div id="rso">
        <div class="MjjYud">
          <div class="g">
            <a href="https://organic.example/one"><h3>First organic result</h3></a>
            <div class="VwiC3b">First organic snippet</div>
          </div>
        </div>
        <div class="MjjYud">
          <div class="g">
            <a href="/url?q=https%3A%2F%2Forganic.example%2Ftwo"><h3>Second organic result</h3></a>
            <div data-sncf>Second organic snippet</div>
          </div>
        </div>
      </div>
    </div>
    <div id="tadsb">
      <div class="uEierd">
        <a href="https://ads.example/bottom">
          <div role="heading">Bottom sponsored result</div>
        </a>
        <div class="MUxGbd">Bottom ad copy</div>
      </div>
    </div>
  </body>
</html>
`;

describe('parseGoogleSearchHtml', () => {
    it('returns only organic results when includeAds is false', () => {
        const results = parseGoogleSearchHtml(GOOGLE_RESULTS_HTML, {
            num: 10,
            page: 1,
            includeAds: false
        });

        expect(results).toEqual([
            {
                title: 'First organic result',
                link: 'https://organic.example/one',
                snippet: 'First organic snippet',
                position: 1,
                type: 'seo'
            },
            {
                title: 'Second organic result',
                link: 'https://organic.example/two',
                snippet: 'Second organic snippet',
                position: 2,
                type: 'seo'
            }
        ]);
    });

    it('includes and marks top and bottom Google Ads', () => {
        const results = parseGoogleSearchHtml(GOOGLE_RESULTS_HTML, {
            num: 10,
            page: 2,
            includeAds: true
        });

        expect(results.map(result => result.type)).toEqual(['ad', 'seo', 'seo', 'ad']);
        expect(results[0]).toEqual({
            title: 'Top sponsored result',
            link: 'https://ads.example/top',
            snippet: 'Top ad copy',
            position: 1,
            type: 'ad'
        });
        expect(results[1].position).toBe(11);
        expect(results[2].position).toBe(12);
        expect(results[3]).toEqual({
            title: 'Bottom sponsored result',
            link: 'https://ads.example/bottom',
            snippet: 'Bottom ad copy',
            position: 2,
            type: 'ad'
        });
    });
});

describe('PuppeteerWebSearch', () => {
    it('builds a localized paginated Google URL and closes the page', async () => {
        const navigateToUrl = vi.fn();
        const close = vi.fn().mockResolvedValue(undefined);
        const waitForSelector = vi.fn().mockResolvedValue(undefined);
        const waitForNavigation = vi.fn().mockResolvedValue(undefined);
        const evaluate = vi.fn().mockResolvedValue(true);
        const pageHelper = {
            navigateToUrl,
            getPage: () => ({
                url: () => 'https://consent.google.com/m',
                waitForNavigation,
                evaluate,
                waitForSelector
            }),
            getFinalHtml: vi.fn().mockResolvedValue(GOOGLE_RESULTS_HTML),
            close
        };
        const puppeteerHelper = {
            getPageHelper: vi.fn().mockResolvedValue(pageHelper)
        };
        const search = new PuppeteerWebSearch(
            puppeteerHelper as any,
            vi.fn() as any,
            new PQueue({ concurrency: 1 })
        );

        const results = await search.search('running shoes', 10, 2, 'de', 'de', true);

        const navigatedUrl = new URL(navigateToUrl.mock.calls[0][0]);
        expect(navigatedUrl.origin + navigatedUrl.pathname).toBe('https://www.google.com/search');
        expect(navigatedUrl.searchParams.get('q')).toBe('running shoes');
        expect(navigatedUrl.searchParams.get('num')).toBe('10');
        expect(navigatedUrl.searchParams.get('start')).toBe('10');
        expect(navigatedUrl.searchParams.get('gl')).toBe('de');
        expect(navigatedUrl.searchParams.get('hl')).toBe('de');
        expect(results.some(result => result.type === 'ad')).toBe(true);
        expect(evaluate).toHaveBeenCalledOnce();
        expect(waitForNavigation).toHaveBeenCalledOnce();
        expect(close).toHaveBeenCalledOnce();
    });
});
