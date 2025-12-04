import type { IIcon } from 'parse-favicon'; // Type-only import
import { toArray } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { getBaseUrl } from "./getBaseUrl.js";

// Define the function types for fetching text and buffer data.
// These are required by the `parse-favicon` library.
export type FetchTextFunction = (url: string) => Promise<string>;
export type FetchBufferFunction = (url: string) => Promise<ArrayBuffer>;

export type GetWebsiteIconDependencies = {
    fetchText: FetchTextFunction;
    fetchBuffer: FetchBufferFunction;
};

// The returned function will only need the URL, as the fetching logic is now injected.
export type GetWebsiteIconFunction = (pageURL: string) => Promise<string[]>;

function getHighestResolutionIcon(icons: any[]): IIcon | undefined {
    const iconEntries = icons
        .filter(icon => icon.size)
        .map(icon => {
            let maxArea = 0;
            if (Array.isArray(icon.size)) {
                // If size is an array, find the largest area among the sizes.
                maxArea = icon.size.reduce((max: number, size: any) => {
                    const area = (size?.width ?? 0) * (size?.height ?? 0);
                    return Math.max(max, area);
                }, 0);
            } else if (icon.size?.width != null && icon.size?.height != null) {
                // If size is a single object, calculate its area.
                maxArea = icon.size.width * icon.size.height;
            }
            return { icon, maxArea };
        })
        .filter(data => data.maxArea > 0);

    if (iconEntries.length === 0) {
        return undefined;
    }

    // Reduce the array to find the icon with the overall largest area.
    const bestIconData = iconEntries.reduce((best, current) => {
        return current.maxArea > best.maxArea ? current : best;
    });

    return bestIconData.icon;
}

export function createGetWebsiteIcon(dependencies: GetWebsiteIconDependencies): GetWebsiteIconFunction {
    const { fetchText, fetchBuffer } = dependencies;

    // The returned function now encapsulates the fetching logic provided via dependencies.
    async function getWebsiteIcon(pageURL: string): Promise<string[]> {
        const baseUrl = getBaseUrl(pageURL);
        // Dynamically import the ESM module
        const { parseFavicon } = await import('parse-favicon');

        // Pass the injected fetchers directly to parseFavicon.
        const iconsObservable = parseFavicon(baseUrl, fetchText, fetchBuffer);
        const iconsArrayObservable = iconsObservable.pipe(toArray());
        const favicons = await firstValueFrom(iconsArrayObservable);
        const highestResolutionIcon = getHighestResolutionIcon(favicons);

        if(!highestResolutionIcon) {
            return [];
        }

        return [new URL(highestResolutionIcon.url, baseUrl).href];
    }

    return getWebsiteIcon;
}
