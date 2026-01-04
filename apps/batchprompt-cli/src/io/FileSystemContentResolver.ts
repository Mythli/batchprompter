import * as fsPromises from 'fs/promises';
import * as path from 'path';
import OpenAI from 'openai';
import { ContentResolver } from 'batchprompt';

export class FileSystemContentResolver implements ContentResolver {
    
    async readText(filePath: string): Promise<string> {
        return fsPromises.readFile(filePath, 'utf-8');
    }

    async resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        try {
            const stats = await fsPromises.stat(input);

            if (stats.isDirectory()) {
                return this.loadDirectory(input);
            }

            if (stats.isFile()) {
                return this.loadFile(input);
            }
        } catch (error: any) {
            // Heuristic Check: Is this likely a file path that doesn't exist?
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

            // Treat as raw text if it doesn't look like a file path
            if (error.code === 'ENOENT' || error.code === 'ENAMETOOLONG' || error.code === 'EINVAL') {
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

    private getPartType(filePath: string): 'text' | 'image' | 'audio' {
        const ext = path.extname(filePath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
        if (['.mp3', '.wav'].includes(ext)) return 'audio';
        return 'text';
    }
}
