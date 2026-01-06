import { PluginServices } from '../../plugins/types.js';

export interface GenericHandler {
    name: string;
    /**
     * Returns the raw content (usually HTML).
     */
    handle(url: string, services: PluginServices): Promise<string | null>;
    
    /**
     * Returns true if this handler can handle the given URL.
     */
    canHandle(url: string): boolean;
}
