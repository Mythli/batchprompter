import { GenericHandler } from './types.js';
import { PreprocessorServices } from '../../../types.js';
export declare class GenericPuppeteerHandler implements GenericHandler {
    name: string;
    handle(url: string, services: PreprocessorServices): Promise<string | null>;
}
//# sourceMappingURL=GenericPuppeteerHandler.d.ts.map