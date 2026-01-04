import { SiteHandler, GenericHandler } from '../types.js';
import { PreprocessorServices } from '../../../../types.js';
export declare class WikipediaHandler implements SiteHandler {
    name: string;
    canHandle(url: string): boolean;
    handle(url: string, services: PreprocessorServices, genericHandler: GenericHandler): Promise<string | null>;
}
//# sourceMappingURL=WikipediaHandler.d.ts.map