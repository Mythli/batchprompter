import csv from 'csv-parser';
import { Readable } from 'stream';

/**
 * Converts a flat object with dot-notation keys into a nested object.
 * e.g. { "webSearch.link": "x", "name": "y" } → { webSearch: { link: "x" }, name: "y" }
 */
function unflatten(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        const parts = key.split('.');
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in current) || typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }
    return result;
}

export async function loadData(): Promise<Record<string, any>[] | undefined> {
    if (process.stdin.isTTY) {
        // No data piped
        return undefined;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const content = buffer.toString('utf-8').trim();

    if (!content) {
        return undefined;
    }

    // Simple heuristic for JSON
    if (content.startsWith('[') || content.startsWith('{')) {
        try {
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
                return data;
            } else if (typeof data === 'object' && data !== null) {
                return [data];
            }
        } catch (e) {
            // Fall through to CSV if JSON parse fails
        }
    }

    // CSV parsing
    const rows: Record<string, any>[] = [];
    const stream = Readable.from(buffer);
    
    return new Promise((resolve, reject) => {
        stream
            .pipe(csv())
            .on('data', (data) => rows.push(unflatten(data)))
            .on('end', () => resolve(rows))
            .on('error', (err) => reject(err));
    });
}
