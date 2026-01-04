import { Command } from 'commander';
import { PromptPreprocessorPlugin } from './types.js';
export declare class PromptPreprocessorRegistry {
    private plugins;
    register(plugin: PromptPreprocessorPlugin): void;
    get(name: string): PromptPreprocessorPlugin | undefined;
    getAll(): PromptPreprocessorPlugin[];
    configureCLI(program: Command): void;
}
//# sourceMappingURL=PromptPreprocessorRegistry.d.ts.map