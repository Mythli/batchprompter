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
export declare function makeSchemaOptional(schema: any): any;
//# sourceMappingURL=schemaUtils.d.ts.map