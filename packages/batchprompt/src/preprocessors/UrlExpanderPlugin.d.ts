import OpenAI from 'openai';
import { PromptPreprocessorPlugin, PreprocessorContext } from './types.js';
import { UrlHandlerRegistry } from './expander/UrlHandlerRegistry.js';
import { PreprocessorConfigDefinition } from '../../types.js';
export declare class UrlExpanderPlugin implements PromptPreprocessorPlugin {
    private registry;
    name: string;
    flagName: string;
    constructor(registry: UrlHandlerRegistry);
    register(program: any): void;
    registerStep(program: any, stepIndex: number): void;
    normalize(options: Record<string, any>, stepIndex: number, globalConfig: any): PreprocessorConfigDefinition | undefined;
    process(parts: OpenAI.Chat.Completions.ChatCompletionContentPart[], context: PreprocessorContext, config: any): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
    private toCamel;
}
//# sourceMappingURL=UrlExpanderPlugin.d.ts.map