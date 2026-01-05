import OpenAI from 'openai';
import { ContentResolver } from './ContentResolver.js';

export class MemoryContentResolver implements ContentResolver {
    private virtualFiles = new Map<string, string>();

    setFile(path: string, content: string) {
        this.virtualFiles.set(path, content);
    }
    
    async readText(path: string): Promise<string> {
        if (this.virtualFiles.has(path)) {
            return this.virtualFiles.get(path)!;
        }
        
        // In memory mode, we assume the "path" is actually the content if it's passed here,
        // or we throw because we can't read files.
        // However, for compatibility, if the input looks like a path, we might want to fail.
        // But often in API usage, the "path" might be a key in a provided map of files.
        // For this basic implementation, we'll treat it as raw text or throw.
        
        // If it looks like a file path, we can't resolve it in memory mode without a virtual FS.
        // So we throw to be safe.
        throw new Error(`Cannot read file '${path}' in memory-only mode.`);
    }

    async resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (this.virtualFiles.has(input)) {
            return [{ type: 'text', text: this.virtualFiles.get(input)! }];
        }
        // In memory mode, we treat all input as raw text.
        return [{ type: 'text', text: input }];
    }
}
