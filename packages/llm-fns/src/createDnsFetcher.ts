import dns from 'dns';
import https from 'https';
import http from 'http';

/**
 * Creates a fetch-like function that uses Google's DNS servers (8.8.8.8, 8.8.4.4)
 * for hostname resolution.
 *
 * This implementation uses Node.js's http/https agents with a custom lookup function.
 * It is primarily compatible with fetch implementations that respect the `agent` option
 * (like node-fetch).
 *
 * @param innerFetch Optional fetch implementation to wrap. Defaults to global fetch.
 */
export function createDnsFetcher(innerFetch?: typeof fetch) {
    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '8.8.4.4']);

    const lookup = (
        hostname: string,
        options: any,
        callback: (err: Error | null, address: string | any[], family: number) => void
    ) => {
        const cb = typeof options === 'function' ? options : callback;
        const opts = typeof options === 'object' ? options : {};

        // If the caller requested all addresses, fallback to system lookup for simplicity
        if (opts.all) {
            return dns.lookup(hostname, opts, cb);
        }

        // Attempt to resolve IPv4 via Google DNS
        resolver.resolve4(hostname, (err, addresses) => {
            if (err || !addresses || addresses.length === 0) {
                // Fallback to system DNS lookup if Google DNS fails or doesn't return IPv4
                return dns.lookup(hostname, opts, cb);
            }
            // Return the first resolved address
            cb(null, addresses[0], 4);
        });
    };

    const httpAgent = new http.Agent({ lookup });
    const httpsAgent = new https.Agent({ lookup });

    const fetchImpl = innerFetch || globalThis.fetch;

    return (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlString = typeof url === 'string'
            ? url
            : (url instanceof Request ? url.url : url.toString());

        const isHttps = urlString.startsWith('https');

        return fetchImpl(url, {
            ...init,
            // Pass agents for libraries like node-fetch
            agent: isHttps ? httpsAgent : httpAgent,
        } as any);
    };
}
