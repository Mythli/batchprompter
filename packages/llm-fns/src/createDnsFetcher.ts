import dns from 'dns';
import https from 'https';
import http from 'http';

/**
 * Creates a fetch-like function that uses specific DNS servers for hostname resolution.
 * Defaults to Google's DNS servers (8.8.8.8, 8.8.4.4).
 *
 * This implementation uses Node.js's http/https agents with a custom lookup function.
 * It is primarily compatible with fetch implementations that respect the `agent` option
 * (like node-fetch or the built-in fetch in Node.js 18+).
 *
 * @param dnsServers Array of DNS server IP addresses. Defaults to Google DNS.
 * @param innerFetch Optional fetch implementation to wrap. Defaults to global fetch.
 */
export function createDnsFetcher(
    dnsServers: string[] = ['8.8.8.8', '8.8.4.4'],
    innerFetch?: typeof fetch
) {
    const resolver = new dns.Resolver();
    resolver.setServers(dnsServers);

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

        // Attempt to resolve IPv4 via configured DNS servers
        resolver.resolve4(hostname, (err, addresses) => {
            if (err || !addresses || addresses.length === 0) {
                // Fallback to system DNS lookup if custom DNS fails or doesn't return IPv4
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
