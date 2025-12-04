/**
 * Converts a full URL (potentially with path, query, fragment) to its base URL.
 * e.g., "https://abc.de/a/b?query=1#hash" -> "https://abc.de"
 * e.g., "http://localhost:3000/path" -> "http://localhost:3000"
 * @param pageURL The full URL string.
 * @returns The base URL (scheme + hostname + port if non-default), or null if the URL is invalid.
 */
export function getBaseUrl(pageURL: string): string {
    // If the URL doesn't have a scheme, URL constructor will throw.
    // We can try prepending "https://" as a common default if it's missing.
    let urlToParse = pageURL;
    if (!pageURL.startsWith('http://') && !pageURL.startsWith('https://') && !pageURL.startsWith('//')) {
        // Avoid prepending if it's a data URI or other scheme
        if (pageURL.includes(':')) {
            // It might be a different scheme, or malformed. Let URL constructor handle it.
        } else {
            urlToParse = `https://${pageURL.replace(/^\/\//, '')}`; // Handle cases like "//example.com" or "example.com"
        }
    } else if (pageURL.startsWith('//')) { // Protocol-relative URL
        // Prepend a common protocol, e.g., https, for URL object to parse origin correctly
        urlToParse = `https:${pageURL}`;
    }

    const url = new URL(urlToParse);
    return url.origin; // e.g., "https://abc.de" or "http://localhost:3000"
}
