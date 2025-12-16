import fsPromises from 'fs/promises';
import Handlebars from 'handlebars';

/**
 * Loads JSON schemas from files or parses inline schemas
 */
export class SchemaLoader {
    private cache = new Map<string, string>();

    async load(source: string, context?: Record<string, any>): Promise<any> {
        let rawContent: string;

        if (this.cache.has(source)) {
            rawContent = this.cache.get(source)!;
        } else {
            try {
                const stats = await fsPromises.stat(source);
                if (stats.isFile()) {
                    rawContent = await fsPromises.readFile(source, 'utf-8');
                    this.cache.set(source, rawContent);
                } else {
                    rawContent = source;
                }
            } catch (e: any) {
                if (e.code === 'ENOENT' || e.code === 'ENAMETOOLONG' || e.code === 'EINVAL') {
                    rawContent = source;
                } else {
                    throw e;
                }
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

    async loadWithContext(source: string, row: Record<string, any>): Promise<any> {
        let resolvedPath = source;
        if (source.includes('{{')) {
            const pathTemplate = Handlebars.compile(source, { noEscape: true });
            resolvedPath = pathTemplate(row);
        }
        return this.load(resolvedPath, row);
    }

    clearCache(): void {
        this.cache.clear();
    }
}
