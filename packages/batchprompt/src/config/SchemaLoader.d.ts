import { ContentResolver } from '../core/io/ContentResolver.js';
/**
 * Loads JSON schemas from files or parses inline schemas
 */
export declare class SchemaLoader {
    private contentResolver;
    private cache;
    constructor(contentResolver: ContentResolver);
    load(source: string, context?: Record<string, any>): Promise<any>;
}
//# sourceMappingURL=SchemaLoader.d.ts.map