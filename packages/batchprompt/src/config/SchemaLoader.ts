/**
 * Interface for loading JSON schemas.
 * Implementations should handle file reading and template rendering.
 */
export interface SchemaLoader {
    load(source: string, context?: Record<string, any>): Promise<any>;
}
