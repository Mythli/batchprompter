/**
 * An LLM client with pre-bound system and prompt parts.
 * This ensures prompts are never forgotten when calling the LLM.
 */
export class BoundLlmClient {
    client;
    systemParts;
    promptParts;
    constructor(client, systemParts, promptParts) {
        this.client = client;
        this.systemParts = systemParts;
        this.promptParts = promptParts;
    }
    /**
     * Builds the messages array from stored parts and optional prefix/suffix.
     */
    buildMessages(options) {
        const messages = [];
        // 1. System message
        if (this.systemParts.length > 0) {
            const content = this.flattenContent(this.systemParts);
            messages.push({ role: 'system', content: content });
        }
        // 2. User message: prefix + promptParts + suffix
        const userParts = [];
        if (options?.prefix && options.prefix.length > 0) {
            userParts.push(...options.prefix);
        }
        if (this.promptParts.length > 0) {
            if (userParts.length > 0) {
                userParts.push({ type: 'text', text: '\n\n' });
            }
            userParts.push(...this.promptParts);
        }
        if (options?.suffix && options.suffix.length > 0) {
            if (userParts.length > 0) {
                userParts.push({ type: 'text', text: '\n\n' });
            }
            userParts.push(...options.suffix);
        }
        if (userParts.length > 0) {
            messages.push({ role: 'user', content: userParts });
        }
        return messages;
    }
    flattenContent(parts) {
        const allText = parts.every(p => p.type === 'text');
        if (allText) {
            return parts.map(p => p.text).join('\n\n');
        }
        return parts;
    }
    async promptZod(arg1, arg2) {
        let options;
        let schema;
        if (arg2 !== undefined) {
            options = arg1;
            schema = arg2;
        }
        else {
            schema = arg1;
        }
        const messages = this.buildMessages(options);
        return this.client.promptZod(messages, schema);
    }
    async promptJson(arg1, arg2) {
        let options;
        let schema;
        if (arg2 !== undefined) {
            options = arg1;
            schema = arg2;
        }
        else {
            schema = arg1;
        }
        const messages = this.buildMessages(options);
        return this.client.promptJson(messages, schema);
    }
    async promptText(options) {
        const messages = this.buildMessages(options);
        return this.client.promptText({ messages });
    }
    /**
     * Raw prompt call with full control over messages.
     * Useful for strategies that need to manage conversation history.
     */
    async prompt(params) {
        return this.client.prompt(params);
    }
    /**
     * Get the underlying raw LlmClient for advanced use cases.
     */
    getRawClient() {
        return this.client;
    }
    /**
     * Get the stored system parts.
     */
    getSystemParts() {
        return this.systemParts;
    }
    /**
     * Get the stored prompt parts.
     */
    getPromptParts() {
        return this.promptParts;
    }
}
//# sourceMappingURL=BoundLlmClient.js.map