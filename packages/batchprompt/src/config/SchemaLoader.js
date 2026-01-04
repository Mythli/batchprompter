import Handlebars from 'handlebars';
/**
 * Loads JSON schemas from files or parses inline schemas
 */
export class SchemaLoader {
    contentResolver;
    cache = new Map();
    constructor(contentResolver) {
        this.contentResolver = contentResolver;
    }
    async load(source, context) {
        let rawContent;
        if (this.cache.has(source)) {
            rawContent = this.cache.get(source);
        }
        else {
            try {
                rawContent = await this.contentResolver.readText(source);
                this.cache.set(source, rawContent);
            }
            catch (e) {
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
        }
        catch (e) {
            const snippet = rawContent.length > 100 ? rawContent.substring(0, 100) + '...' : rawContent;
            throw new Error(`Failed to parse JSON schema.\nSource: ${source}\nError: ${e.message}\nContent: ${snippet}`);
        }
    }
}
//# sourceMappingURL=SchemaLoader.js.map