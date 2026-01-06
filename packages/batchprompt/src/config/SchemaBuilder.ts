import { z } from 'zod';
import { PluginRegistryV2 } from '../plugins/types.js';
import { createPipelineSchema } from './createPipelineSchema.js';

export class SchemaBuilder {
    constructor(private registry: PluginRegistryV2) {}

    build(mode: 'input' | 'runtime' = 'input') {
        // Input: Schema can be string (path) or object.
        // Runtime: Schema can be string (template) or object.
        const jsonSchemaType = z.union([z.string(), z.record(z.string(), z.any())]);
        
        return createPipelineSchema(this.registry, jsonSchemaType, mode === 'input');
    }
}
