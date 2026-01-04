import { ContentResolver } from '../core/io/ContentResolver.js';
import { PluginRegistryV2 } from '../plugins/types.js';
export declare class ConfigNormalizer {
    private contentResolver;
    private pluginRegistry;
    constructor(contentResolver: ContentResolver, pluginRegistry: PluginRegistryV2);
    normalize(config: any): Promise<any>;
    private loadSchema;
}
//# sourceMappingURL=ConfigNormalizer.d.ts.map