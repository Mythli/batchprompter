import Handlebars from 'handlebars';
export class MessageBuilder {
    /**
     * Builds a complete messages array from a resolved model config and row context.
     */
    build(config, row, externalContent) {
        const messages = [];
        // 1. System Message
        if (config.systemParts && config.systemParts.length > 0) {
            const renderedSystem = this.renderParts(config.systemParts, row);
            const content = this.flattenContent(renderedSystem);
            messages.push({ role: 'system', content: content });
        }
        // 2. User Message
        const userParts = [];
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
    buildSimple(row, userContent) {
        if (userContent.length === 0) {
            return [];
        }
        const renderedParts = this.renderParts(userContent, row);
        return [{ role: 'user', content: renderedParts }];
    }
    renderParts(parts, row) {
        return parts.map(part => {
            if (part.type === 'text') {
                const delegate = Handlebars.compile(part.text, { noEscape: true });
                return { type: 'text', text: delegate(row) };
            }
            return part;
        });
    }
    flattenContent(parts) {
        const allText = parts.every(p => p.type === 'text');
        if (allText) {
            return parts.map(p => p.text).join('\n\n');
        }
        return parts;
    }
}
//# sourceMappingURL=MessageBuilder.js.map