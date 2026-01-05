import traverse from 'json-schema-traverse';
import Handlebars from 'handlebars';

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

/**
 * Renders a JSON Schema object using Handlebars templates against a context.
 * 
 * @param schema The schema object (or array) containing potential Handlebars templates.
 * @param context The data context for rendering.
 * @returns The rendered schema object.
 */
export function renderSchemaObject(schema: any, context: Record<string, any>): any {
    if (typeof schema !== 'object' || schema === null) {
        return schema;
    }

    const jsonString = JSON.stringify(schema);

    // Optimization: If no templates, return original
    if (!jsonString.includes('{{')) {
        return schema;
    }

    try {
        const template = Handlebars.compile(jsonString, { noEscape: true });
        const renderedString = template(context);
        return JSON.parse(renderedString);
    } catch (e: any) {
        throw new Error(`Failed to render schema template: ${e.message}`);
    }
}
