import traverse from 'json-schema-traverse';

/**
 * Creates a copy of a JSON Schema with all fields made optional/nullable.
 * This is useful for partial data extraction where not all fields may be present.
 * 
 * Transformations applied:
 * - All `type` values are wrapped to include "null" (e.g., "string" -> ["string", "null"])
 * - All `required` arrays are removed
 * 
 * @param schema The original JSON Schema
 * @returns A new schema with all fields optional/nullable
 */
export function makeSchemaOptional(schema: any): any {
    // Deep clone to avoid mutating the original
    const cloned = JSON.parse(JSON.stringify(schema));
    
    traverse(cloned, (subSchema: any) => {
        // Make type nullable
        if (subSchema.type !== undefined) {
            if (typeof subSchema.type === 'string') {
                if (subSchema.type !== 'null') {
                    subSchema.type = [subSchema.type, 'null'];
                }
            } else if (Array.isArray(subSchema.type)) {
                if (!subSchema.type.includes('null')) {
                    subSchema.type = [...subSchema.type, 'null'];
                }
            }
        }
        
        // Remove required arrays to make all properties optional
        if (subSchema.required) {
            delete subSchema.required;
        }
    });
    
    return cloned;
}
