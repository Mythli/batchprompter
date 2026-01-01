import { PreprocessorServices } from '../../types.js';

export interface GenericHandler {
    name: string;
    /**
     * Returns the raw content (usually HTML).
     */
    handle(url: string, services: PreprocessorServices): Promise<string | null>;
}

export interface SiteHandler {
    name: string;
    canHandle(url: string): boolean;
    /**
     * Returns the processed content (usually Markdown).
     */
    handle(url: string, services: PreprocessorServices, genericHandler: GenericHandler): Promise<string | null>;
}
