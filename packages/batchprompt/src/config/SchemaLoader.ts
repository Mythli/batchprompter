/**
 * Interface for loading JSON schemas.
 * Implementations should handle file reading.
 */
export interface SchemaLoader {
    load(source: string): Promise<any>;
}
