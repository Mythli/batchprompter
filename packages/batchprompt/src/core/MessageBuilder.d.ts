import OpenAI from 'openai';
import { ResolvedModelConfig } from '../../types.js';
export declare class MessageBuilder {
    /**
     * Builds a complete messages array from a resolved model config and row context.
     */
    build(config: ResolvedModelConfig, row: Record<string, any>, externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    /**
     * Builds messages for a simple prompt (just user content, no system).
     */
    buildSimple(row: Record<string, any>, userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    private renderParts;
    private flattenContent;
}
//# sourceMappingURL=MessageBuilder.d.ts.map