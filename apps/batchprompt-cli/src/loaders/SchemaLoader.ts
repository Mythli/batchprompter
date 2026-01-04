import Handlebars from 'handlebars';
import { ContentResolver, SchemaLoader as ISchemaLoader } from 'batchprompt';

/**
 * Loads JSON schemas from files or parses inline schemas
 */
export class SchemaLoader implements ISchemaLoader {
    private cache = new Map<string, string>();

    constructor(private contentResolver: ContentResolver) {}

    async load(source: string, context?: Record<string, any>): Promise<any> {
        let rawContent: string;

        if (this.cache.has(source)) {
            rawContent = this.cache.get(source)!;
        } else {
            try {
                rawContent = await this.contentResolver.readText(source);
                this.cache.set(source, rawContent);
            } catch (e: any) {
                // If read fails, assume it's raw JSON content
                rawContent = source;
            }
        }

        if (context && rawContent.includes('{{')) {
            const template = Handlebars.compile(rawContent, { noEscape: true });
            rawContent = template(context);
        }

        try {
            return JSON.parse(rawContent);
        } catch (e: any) {
            const snippet = rawContent.length > 100 ? rawContent.substring(0, 100) + '...' : rawContent;
            throw new Error(`Failed to parse JSON schema.\nSource: ${source}\nError: ${e.message}\nContent: ${snippet}`);
        }
    }
}
