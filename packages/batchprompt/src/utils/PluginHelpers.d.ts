import { ModelDefinition, ResolvedModelConfig } from '../types.js';
import { ContentResolver } from '../src/core/io/ContentResolver.js';
export declare class PluginHelpers {
    /**
     * Resolves a ModelDefinition (paths/strings) into a ResolvedModelConfig (content parts).
     * Applies Handlebars substitution to the content.
     */
    static resolveModelConfig(def: ModelDefinition, row: Record<string, any>, contentResolver: ContentResolver): Promise<ResolvedModelConfig>;
}
//# sourceMappingURL=PluginHelpers.d.ts.map