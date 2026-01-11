import { PluginResult } from '../plugins/types.js';

export interface GenerationStrategy {
    execute(cacheSalt?: string | number): Promise<PluginResult>;
}
