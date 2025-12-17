import csv from 'csv-parser';
import { Readable } from 'stream';

export async function loadData(): Promise<Record<string, any>[]> {
    if (process.stdin.isTTY) {
        // No data piped
        return [];
    }

    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const content = buffer.toString('utf-8').trim();

    if (!content) {
        return [];
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
    const rows: Record<string, string>[] = [];
    const stream = Readable.from(buffer);
    
    return new Promise((resolve, reject) => {
        stream
            .pipe(csv())
            .on('data', (data) => rows.push(data))
            .on('end', () => resolve(rows))
            .on('error', (err) => reject(err));
    });
}
