import { ContentResolver, SchemaLoader as ISchemaLoader } from 'batchprompt';

/**
 * Loads JSON schemas from files or parses inline schemas
 */
export class SchemaLoader implements ISchemaLoader {
    constructor(private contentResolver: ContentResolver) {}

    async load(source: string): Promise<any> {
        let rawContent: string;

        try {
            rawContent = await this.contentResolver.readText(source);
        } catch (e: any) {
            // If read fails, assume it's raw JSON content
            rawContent = source;
        }

        try {
            return JSON.parse(rawContent);
        } catch (e: any) {
            const snippet = rawContent.length > 100 ? rawContent.substring(0, 100) + '...' : rawContent;
            throw new Error(`Failed to parse JSON schema.\nSource: ${source}\nError: ${e.message}\nContent: ${snippet}`);
        }
    }
}
