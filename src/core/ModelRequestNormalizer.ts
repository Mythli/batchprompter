// 
import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ResolvedModelConfig } from '../types.js';

export interface LlmRequest {
    model: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    options: Record<string, any>;
}

export class ModelRequestNormalizer {

    static normalize(
        config: ResolvedModelConfig,
        row: Record<string, any>,
        externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): LlmRequest {

        if (!config.model) {
            throw new Error("Model configuration missing. Please specify a model via --model or specific flags.");
        }

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // 1. System Message
        if (config.systemParts && config.systemParts.length > 0) {
            const renderedSystem = this.renderParts(config.systemParts, row);
            // Flatten text parts if possible
            const content = this.flattenContent(renderedSystem);
            // Cast content to any to avoid strict type issues with ChatCompletionMessageParam
            // which expects text-only for system messages in some definitions, but we handle it.
            messages.push({ role: 'system', content: content as any });
        }

        // 2. User Message
        const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        // a) Config Prompt (e.g. from --prompt or --judge-prompt)
        if (config.promptParts && config.promptParts.length > 0) {
            userParts.push(...this.renderParts(config.promptParts, row));
        }

        // b) External Content (e.g. from positional args)
        if (externalContent && externalContent.length > 0) {
            // Add a separator if we have both
            if (userParts.length > 0) {
                userParts.push({ type: 'text', text: '\n\n' });
            }
            userParts.push(...this.renderParts(externalContent, row));
        }

        if (userParts.length > 0) {
            messages.push({ role: 'user', content: userParts });
        }

        // 3. Options & Thinking Level
        const options: Record<string, any> = {};
        if (config.temperature !== undefined) {
            options.temperature = config.temperature;
        }

        if (config.thinkingLevel) {
            options.reasoning_effort = config.thinkingLevel;
        }

        return {
            model: config.model,
            messages,
            options
        };
    }

    private static renderParts(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        row: Record<string, any>
    ): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return parts.map(part => {
            if (part.type === 'text') {
                const delegate = Handlebars.compile(part.text, { noEscape: true });
                return { type: 'text', text: delegate(row) };
            }
            return part;
        });
    }

    private static flattenContent(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        // If all parts are text, join them
        const allText = parts.every(p => p.type === 'text');
        if (allText) {
            return parts.map(p => (p as any).text).join('\n\n');
        }
        return parts;
    }
}
