import { PuppeteerPageHelper } from '../PupeteerPageHelper.js';
import { FetchAndCreateDataUriFunction } from './fetchAndCreateBase64DataUri.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { URL } from 'url';

export type CreateFetchAndCreateRelativeFileDependencies = {
    pageHelper: PuppeteerPageHelper;
    outputDir: string;
    urlPrefix?: string;
};

/**
 * Creates a function that fetches a resource, saves it to a local directory,
 * and returns a relative path to the saved file.
 * The returned function is pre-configured with a PuppeteerPageHelper instance and an output directory.
 * @param dependencies - The dependencies needed to create the fetcher function.
 * @returns A function that takes a URL and returns a relative file path string.
 */
export function createFetchAndCreateRelativeFileDataUri(
    { pageHelper, outputDir, urlPrefix }: CreateFetchAndCreateRelativeFileDependencies
): FetchAndCreateDataUriFunction {
    /**
     * Fetches a resource from the given URL, saves it to disk, and returns a relative path.
     * @param url - The URL of the resource to fetch.
     * @returns A promise that resolves to the relative file path string.
     */
    return async function fetchAndCreateRelativeFile(url: string): Promise<string> {
        const parsedUrl = new URL(url);
        // Create a relative path from the URL's pathname, removing any leading slash.
        let relativePath = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.substring(1) : parsedUrl.pathname;

        // If the path is empty (e.g., for the root URL), or ends with a slash, treat it as a directory
        // and append a default filename like 'index.html'.
        if (!relativePath || relativePath.endsWith('/')) {
            relativePath = path.join(relativePath, 'index.html');
        }

        const fullDiskPath = path.join(outputDir, relativePath);
        const directoryPath = path.dirname(fullDiskPath);

        // Ensure the directory exists
        await fs.mkdir(directoryPath, { recursive: true });

        const response = await pageHelper.fetchResourceAsDataWithCache(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();

        await fs.writeFile(fullDiskPath, Buffer.from(buffer));

        console.log(`[File Saver] Saved ${url} to ${fullDiskPath}`);

        // Ensure the path uses forward slashes for URL compatibility.
        const urlPath = relativePath.replace(/\\/g, '/');

        // If a prefix is provided, create a root-relative path. Otherwise, return the simple relative path.
        if (urlPrefix) {
            return `${urlPrefix}/${urlPath}`;
        }
        return urlPath;
    }
}
