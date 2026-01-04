import Papa from 'papaparse';
import { getUniqueRows } from 'batchprompt';

export async function parseSampleFile(file: File): Promise<any[]> {
    if (!file || file.size === 0) return [];
    const content = await file.text();
    let sampleRows: any[] = [];

    if (file.name.endsWith('.json')) {
        try {
            const json = JSON.parse(content);
            sampleRows = Array.isArray(json) ? json : [json];
        } catch (e) {
            throw new Error('Invalid JSON file');
        }
    } else if (file.name.endsWith('.csv')) {
        const parsed = Papa.parse(content, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });
        
        if (parsed.data && Array.isArray(parsed.data)) {
            sampleRows = parsed.data;
        }
    }

    if (sampleRows.length > 0) {
        return getUniqueRows(sampleRows, 10);
    }

    return [];
}
