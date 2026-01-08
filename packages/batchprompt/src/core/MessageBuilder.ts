import OpenAI from 'openai';
import Handlebars from 'handlebars';
import { ResolvedModelConfig } from '../config/types.js';
import { concatMessageText } from 'llm-fns';

export class MessageBuilder {
    /**
     * Builds a complete messages array from a resolved model config and row context.
     */
    build(
        config: ResolvedModelConfig,
        row: Record<string, any>,
        externalContent?: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        // config.messages is already populated with system and user prompts from the config transformation
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // 1. Render existing messages from config
        for (const msg of config.messages) {
            if (typeof msg.content === 'string') {
                messages.push({ ...msg, content: this.render(msg.content, row) });
            } else if (Array.isArray(msg.content)) {
                messages.push({ ...msg, content: this.renderParts(msg.content, row) });
            } else {
                messages.push(msg);
            }
        }

        // 2. Append External Content (e.g. from positional args or plugins)
        if (externalContent && externalContent.length > 0) {
            const renderedExternal = this.renderParts(externalContent, row);
            
            // Try to append to last user message if possible
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
                // Add separator if needed
                if (lastMsg.content.length > 0) {
                    (lastMsg.content as any[]).push({ type: 'text', text: '\n\n' });
                }
                (lastMsg.content as any[]).push(...renderedExternal);
            } else {
                messages.push({ role: 'user', content: renderedExternal });
            }
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
                return { type: 'text' as const, text: this.render(part.text, row) };
            }
            return part;
        });
    }

    private render(template: string, row: Record<string, any>): string {
        const delegate = Handlebars.compile(template, { noEscape: true });
        return delegate(row);
    }
}
