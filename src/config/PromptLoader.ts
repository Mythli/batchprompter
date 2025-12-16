import OpenAI from 'openai';
import fsPromises from 'fs/promises';
import path from 'path';
import { PromptDef } from './types.js';

/**
 * Loads and converts prompt definitions to OpenAI content parts
 */
export class PromptLoader {
    private cache = new Map<string, OpenAI.Chat.Completions.ChatCompletionContentPart[]>();

    async load(prompt: PromptDef): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (typeof prompt === 'string') {
            return this.loadString(prompt);
        }

        if (prompt.file) {
            return this.loadFile(prompt.file);
        }

        if (prompt.text) {
            return [{ type: 'text', text: prompt.text }];
        }

        if (prompt.parts) {
            return this.loadParts(prompt.parts);
        }

        return [];
    }

    private async loadString(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (this.cache.has(input)) {
            return this.cache.get(input)!;
        }

        try {
            const stats = await fsPromises.stat(input);

            if (stats.isDirectory()) {
                const result = await this.loadDirectory(input);
                this.cache.set(input, result);
                return result;
            }

            if (stats.isFile()) {
                const result = await this.loadFile(input);
                this.cache.set(input, result);
                return result;
            }
        } catch (error: any) {
            if (error.code === 'ENOENT' || error.code === 'ENAMETOOLONG' || error.code === 'EINVAL') {
                const hasNewlines = input.includes('\n');
                const hasSpaces = input.includes(' ');

                if (!hasNewlines && !hasSpaces) {
                    const hasPathSeparators = input.includes('/') || input.includes('\\');
                    const isShort = input.length < 255;
                    const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(input);

                    if (hasPathSeparators || (isShort && hasExtension)) {
                        throw new Error(`File not found: ${input}`);
                    }
                }

                return [{ type: 'text', text: input }];
            }
            throw error;
        }

        return [{ type: 'text', text: input }];
    }

    private async loadFile(filePath: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const type = this.getPartType(filePath);

        if (type === 'text') {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            return content.trim().length > 0 ? [{ type: 'text', text: content }] : [];
        }

        const buffer = await fsPromises.readFile(filePath);
        const base64 = buffer.toString('base64');
        const ext = path.extname(filePath).toLowerCase();

        if (type === 'image') {
            let mime = 'image/jpeg';
            if (ext === '.png') mime = 'image/png';
            if (ext === '.gif') mime = 'image/gif';
            if (ext === '.webp') mime = 'image/webp';

            return [{
                type: 'image_url',
                image_url: { url: `data:${mime};base64,${base64}` }
            }];
        }

        if (type === 'audio') {
            const format = ext === '.mp3' ? 'mp3' : 'wav';
            return [{
                type: 'input_audio',
                input_audio: { data: base64, format }
            }];
        }

        return [];
    }

    private async loadDirectory(dirPath: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const files = await fsPromises.readdir(dirPath);
        files.sort();

        const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        let currentTextBuffer: string[] = [];

        const flushText = () => {
            if (currentTextBuffer.length > 0) {
                parts.push({ type: 'text', text: currentTextBuffer.join('\n\n') });
                currentTextBuffer = [];
            }
        };

        for (const file of files) {
            if (file.startsWith('.')) continue;

            const filePath = path.join(dirPath, file);
            const stats = await fsPromises.stat(filePath);

            if (!stats.isFile()) continue;

            const type = this.getPartType(filePath);

            if (type === 'text') {
                const content = await fsPromises.readFile(filePath, 'utf-8');
                if (content.trim().length > 0) {
                    currentTextBuffer.push(content);
                }
            } else {
                flushText();
                const fileParts = await this.loadFile(filePath);
                parts.push(...fileParts);
            }
        }

        flushText();
        return parts;
    }

    private async loadParts(
        parts: { type: 'text' | 'image' | 'audio'; content: string }[]
    ): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        const result: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

        for (const part of parts) {
            if (part.type === 'text') {
                const loaded = await this.loadString(part.content);
                result.push(...loaded);
            } else if (part.type === 'image') {
                if (part.content.startsWith('data:') || part.content.startsWith('http')) {
                    result.push({
                        type: 'image_url',
                        image_url: { url: part.content }
                    });
                } else {
                    const loaded = await this.loadFile(part.content);
                    result.push(...loaded);
                }
            } else if (part.type === 'audio') {
                if (part.content.startsWith('data:')) {
                    const match = part.content.match(/^data:audio\/(\w+);base64,(.+)$/);
                    if (match) {
                        result.push({
                            type: 'input_audio',
                            input_audio: { data: match[2], format: match[1] as 'mp3' | 'wav' }
                        });
                    }
                } else {
                    const loaded = await this.loadFile(part.content);
                    result.push(...loaded);
                }
            }
        }

        return result;
    }

    private getPartType(filePath: string): 'text' | 'image' | 'audio' {
        const ext = path.extname(filePath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
        if (['.mp3', '.wav'].includes(ext)) return 'audio';
        return 'text';
    }

    clearCache(): void {
        this.cache.clear();
    }
}
