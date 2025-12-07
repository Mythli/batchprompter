import { PluginServices } from '../../plugins/types.js';

export interface GenericHandler {
    name: string;
    /**
     * Returns the raw content (usually HTML).
     */
    handle(url: string, services: PluginServices): Promise<string | null>;
}

export interface SiteHandler {
    name: string;
    canHandle(url: string): boolean;
    /**
     * Returns the processed content (usually Markdown).
     */
    handle(url: string, services: PluginServices, genericHandler: GenericHandler): Promise<string | null>;
}
