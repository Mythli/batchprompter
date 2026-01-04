import { GenericHandler } from './types.js';
import { PreprocessorServices } from '../../../types.js';
export declare class GenericFetchHandler implements GenericHandler {
    name: string;
    handle(url: string, services: PreprocessorServices): Promise<string | null>;
}
//# sourceMappingURL=GenericFetchHandler.d.ts.map