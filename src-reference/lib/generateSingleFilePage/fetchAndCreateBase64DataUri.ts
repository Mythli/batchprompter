import { PuppeteerPageHelper } from '../PupeteerPageHelper.js';

export type FetchAndCreateDataUriFunction = (url: string) => Promise<string>;

export type CreateFetchAndCreateBase64DataUriDependencies = {
    pageHelper: PuppeteerPageHelper;
};

/**
 * Creates a function that fetches a resource and converts it to a data URI.
 * The returned function is pre-configured with a PuppeteerPageHelper instance.
 * @param dependencies - The dependencies needed to create the fetcher function.
 * @returns A function that takes a URL and returns a data URI string.
 */
export function createFetchAndCreateBase64DataUri(
    { pageHelper }: CreateFetchAndCreateBase64DataUriDependencies
): FetchAndCreateDataUriFunction {
    /**
     * Fetches a resource from the given URL and converts it to a data URI.
     * @param url - The URL of the resource to fetch.
     * @returns A promise that resolves to the data URI string.
     */
    return async function fetchAndCreateBase64DataUri(url: string): Promise<string> {
        const response = await pageHelper.fetchResourceAsDataWithCache(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        return `data:${contentType};base64,${base64}`;
    }
}
