import OpenAI from 'openai';
export interface ResolvedPrompt {
    parts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}
export interface ResolvedModelConfig {
    model?: string;
    temperature?: number;
    thinkingLevel?: 'low' | 'medium' | 'high';
    systemParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[];
}
export interface ResolvedOutputConfig {
    mode: 'merge' | 'column' | 'ignore';
    column?: string;
    explode: boolean;
    limit?: number;
    offset?: number;
}
export interface ResolvedPluginBase {
    type: string;
    id: string;
    output: ResolvedOutputConfig;
}
export interface ServiceCapabilities {
    hasSerper: boolean;
    hasPuppeteer: boolean;
}
//# sourceMappingURL=resolvedTypes.d.ts.map