import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ResolvedModelConfig } from '../types.js';

export class MessageBuilder {
    /**
     * Builds a complete messages array from a resolved model config and row context.
     */
    build(
        config: ResolvedModelConfig,
        row: Record<string, any>,
        externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // 1. System Message
        if (config.systemParts && config.systemParts.length > 0) {
            const renderedSystem = this.renderParts(config.systemParts, row);
            const content = this.flattenContent(renderedSystem);
            messages.push({ role: 'system', content: content as any });
        }

        // 2. User Message
        const userParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        // a) Config Prompt (e.g. from --prompt or --judge-prompt)
        if (config.promptParts && config.promptParts.length > 0) {
            userParts.push(...this.renderParts(config.promptParts, row));
        }

        // b) External Content (e.g. from positional args or plugins)
        if (externalContent && externalContent.length > 0) {
            if (userParts.length > 0) {
                userParts.push({ type: 'text', text: '\n\n' });
            }
            userParts.push(...this.renderParts(externalContent, row));
        }

        if (userParts.length > 0) {
            messages.push({ role: 'user', content: userParts });
        }

        return messages;
    }

    /**
     * Builds messages for a simple prompt (just user content, no system).
     */
    buildSimple(
        row: Record<string, any>,
        userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        if (userContent.length === 0) {
            return [];
        }

        const renderedParts = this.renderParts(userContent, row);
        return [{ role: 'user', content: renderedParts }];
    }

    private renderParts(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[],
        row: Record<string, any>
    ): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        return parts.map(part => {
            if (part.type === 'text') {
                const delegate = Handlebars.compile(part.text, { noEscape: true });
                return { type: 'text' as const, text: delegate(row) };
            }
            return part;
        });
    }

    private flattenContent(
        parts: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
        const allText = parts.every(p => p.type === 'text');
        if (allText) {
            return parts.map(p => (p as any).text).join('\n\n');
        }
        return parts;
    }
}
