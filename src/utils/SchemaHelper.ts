import fs from 'fs/promises';
import Handlebars from 'handlebars';

const rawSchemaCache = new Map<string, string>();

export class SchemaHelper {
    static async loadAndRenderSchema(schemaPath: string | undefined, context: Record<string, any>): Promise<any> {
        if (!schemaPath) return undefined;

        // 1. Resolve the path (it might be dynamic, e.g. "schemas/{{category}}.json")
        const pathDelegate = Handlebars.compile(schemaPath, { noEscape: true });
        const resolvedPath = pathDelegate(context);

        // 2. Get Raw Content (Cache Check)
        let rawContent = rawSchemaCache.get(resolvedPath);
        
        if (!rawContent) {
            try {
                // Check if it is a file
                const stats = await fs.stat(resolvedPath);
                if (stats.isFile()) {
                    rawContent = await fs.readFile(resolvedPath, 'utf-8');
                    // Only cache if it was a file read
                    rawSchemaCache.set(resolvedPath, rawContent);
                } else {
                    // It exists but is not a file? Treat as text.
                    rawContent = resolvedPath;
                }
            } catch (e: any) {
                // If stat fails (ENOENT), it's likely raw JSON text or an invalid path.
                // We treat it as raw text.
                rawContent = resolvedPath;
            }
        }

        if (!rawContent) {
             throw new Error(`Could not load schema content from: ${schemaPath}`);
        }

        // 3. Render Content (The schema itself might contain {{placeholders}})
        try {
            const contentDelegate = Handlebars.compile(rawContent, { noEscape: true });
            const renderedContent = contentDelegate(context);

            // 4. Parse
            return JSON.parse(renderedContent);
        } catch (e: any) {
            // Provide helpful error context
            const snippet = rawContent.length > 100 ? rawContent.substring(0, 100) + '...' : rawContent;
            throw new Error(`Failed to parse JSON schema. \nSource: ${resolvedPath}\nError: ${e.message}\nContent Snippet: ${snippet}`);
        }
    }
}
