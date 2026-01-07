import { z } from 'zod';
import path from 'path';
import os from 'os';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ModelConfigSchema } from './schemas/model.js';
import { OutputConfigSchema } from './common.js';

export function createPipelineSchema(registry: PluginRegistryV2, jsonSchemaType: z.ZodType<any>, isInputMode: boolean) {
    
    const pluginSchemas = registry.getAll().map(p => p.configSchema);
    
    const PluginUnion = pluginSchemas.length > 0 
        ? z.discriminatedUnion('type', pluginSchemas as any)
        : z.object({