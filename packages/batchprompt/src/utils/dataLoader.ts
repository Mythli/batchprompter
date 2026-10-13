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

export function parseJsonData(content: string): Record<string, any>[] | undefined {
    if (!content.startsWith('[') && !content.startsWith('{')) {
        return undefined;
    }

    try {
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
            return data;
        }
        if (typeof data === 'object' && data !== null) {
            return [data];
        }
    } catch {
        // A stream of newline-delimited JSON objects is not one valid JSON
        // document. Parse every non-empty physical line before falling back to
        // CSV; this keeps large JSONL campaign inputs lossless.
        const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length > 1) {
            try {
                const rows = lines.map(line => JSON.parse(line));
                if (rows.every(row => typeof row === 'object' && row !== null && !Array.isArray(row))) {
                    return rows;
                }
            } catch {
                return undefined;
            }
        }
    }

    return undefined;
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

    const jsonData = parseJsonData(content);
    if (jsonData) {
        return jsonData;
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
