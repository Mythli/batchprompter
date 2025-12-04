import * as dns from 'dns';
import type { Cache } from 'cache-manager';

const dnsPromises = dns.promises;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
    valid: boolean;
    reason?: 'invalid_format' | 'no_mx_records' | 'dns_query_failed' | 'timeout' | 'cached_lookup';
    details?: string;
    mxRecords?: dns.MxRecord[];
}

export interface VerifyEmailOptions {
    checkMx?: boolean;
    timeout?: number; // in milliseconds
}

export type VerifyEmailFunction = (email: string, options?: VerifyEmailOptions) => Promise<ValidationResult>;

export interface CreateVerifyEmailDependencies {
    cache?: Cache;
}

export function createVerifyEmail(deps: CreateVerifyEmailDependencies): VerifyEmailFunction {
    const { cache } = deps;

    async function resolveMxWithTimeout(domain: string, timeout: number): Promise<dns.MxRecord[]> {
        return Promise.race([
            dnsPromises.resolveMx(domain),
            new Promise<dns.MxRecord[]>((_, reject) =>
                setTimeout(() => reject(new Error('DNS query timed out')), timeout)
            )
        ]);
    }

    async function resolveMxWithCache(domain: string, timeout: number): Promise<dns.MxRecord[]> {
        const cacheKey = `mx-records:${domain}`;
        if (cache) {
            const cachedRecords = await cache.get<dns.MxRecord[]>(cacheKey);
            if (cachedRecords) {
                // Optionally, you could add a flag to the result to indicate a cache hit.
                // For now, just returning the cached data is sufficient.
                return cachedRecords;
            }
        }

        const records = await resolveMxWithTimeout(domain, timeout);

        if (cache && records && records.length > 0) {
            // Cache successful lookups for 24 hours
            await cache.set(cacheKey, records, 24 * 60 * 60 * 1000);
        }
        return records;
    }

    return async function verifyEmail(email: string, options: VerifyEmailOptions = {}): Promise<ValidationResult> {
        const { checkMx = true, timeout } = options;

        if (!emailRegex.test(email)) {
            return {
                valid: false,
                reason: 'invalid_format',
                details: 'Email does not match the expected format.',
            };
        }

        if (checkMx) {
            const domain = email.split('@')[1]!;
            try {
                const effectiveTimeout = timeout ?? 5000;
                const records = await resolveMxWithCache(domain, effectiveTimeout);

                if (records && records.length > 0) {
                    return {
                        valid: true,
                        mxRecords: records.sort((a, b) => a.priority - b.priority),
                    };
                } else {
                    return {
                        valid: false,
                        reason: 'no_mx_records',
                        details: `No MX records found for domain: ${domain}`,
                    };
                }
            } catch (error: any) {
                if (error.message === 'DNS query timed out') {
                    return {
                        valid: false,
                        reason: 'timeout',
                        details: `DNS query for MX records timed out after ${timeout ?? 5000}ms for domain: ${domain}.`,
                    };
                }

                if (error.code === 'ENODATA' || error.code === 'ENOTFOUND' || error.code === 'ESERVFAIL') {
                    return {
                        valid: false,
                        reason: 'no_mx_records',
                        details: `Could not resolve MX records for domain: ${domain}. DNS response: ${error.code}`,
                    };
                }

                return {
                    valid: false,
                    reason: 'dns_query_failed',
                    details: `DNS query for MX records failed for domain: ${domain}. Error: ${error.message}`,
                };
            }
        }

        return { valid: true };
    }
}
