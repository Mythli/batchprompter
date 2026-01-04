import { z } from 'zod';
import { NormalizedConfig } from '../types.js';
import { PluginRegistryV2 } from '../plugins/types.js';
export declare const createConfigSchema: (pluginRegistry: PluginRegistryV2) => z.ZodEffects<z.ZodObject<{
    fileConfig: z.ZodAny;
    options: z.ZodRecord<z.ZodString, z.ZodAny>;
    args: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    options: Record<string, any>;
    args: string[];
    fileConfig?: any;
}, {
    options: Record<string, any>;
    args: string[];
    fileConfig?: any;
}>, NormalizedConfig, {
    options: Record<string, any>;
    args: string[];
    fileConfig?: any;
}>;
//# sourceMappingURL=ConfigSchema.d.ts.map