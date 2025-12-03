// 
import fsPromises from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

export async function ensureDir(filePath: string) {
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
}

export function getPartType(filePath: string): 'text' | 'image' | 'audio' {
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
    if (['.mp3', '.wav'].includes(ext)) return 'audio';
    return 'text';
}

export function aggressiveSanitize(input: string): string {
    // 1. Replace spaces with underscores for better filename compatibility
    let sanitized = input.trim().replace(/\s+/g, '_');
    
    // 2. Remove anything that is NOT a-z, A-Z, 0-9, -, _
    sanitized = sanitized.replace(/[^a-zA-Z0-9-_]/g, '');
    
    // 3. Truncate to 100 chars
    return sanitized.substring(0, 100);
}

export async function readPromptInput(inputPath: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
    const stats = await fsPromises.stat(inputPath);
    let filePaths: string[] = [];

    if (stats.isDirectory()) {
        const files = await fsPromises.readdir(inputPath);
        files.sort();
        filePaths = files
            .filter(f => !f.startsWith('.'))
            .map(f => path.join(inputPath, f));
    } else {
        filePaths = [inputPath];
    }

    const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    let currentTextBuffer: string[] = [];

    const flushText = () => {
        if (currentTextBuffer.length > 0) {
            parts.push({ type: 'text', text: currentTextBuffer.join('\n\n') });
            currentTextBuffer = [];
        }
    };

    for (const filePath of filePaths) {
        const fileStats = await fsPromises.stat(filePath);
        if (!fileStats.isFile()) continue;

        const type = getPartType(filePath);
        
        if (type === 'text') {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            if (content.trim().length > 0) {
                currentTextBuffer.push(content);
            }
        } else {
            flushText(); 
            
            const buffer = await fsPromises.readFile(filePath);
            const base64 = buffer.toString('base64');
            const ext = path.extname(filePath).toLowerCase();

            if (type === 'image') {
                let mime = 'image/jpeg';
                if (ext === '.png') mime = 'image/png';
                if (ext === '.gif') mime = 'image/gif';
                if (ext === '.webp') mime = 'image/webp';
                
                parts.push({
                    type: 'image_url',
                    image_url: { url: `data:${mime};base64,${base64}` }
                });
            } else if (type === 'audio') {
                const format = ext === '.mp3' ? 'mp3' : 'wav';
                parts.push({
                    type: 'input_audio',
                    input_audio: { data: base64, format }
                });
            }
        }
    }
    flushText();

    if (parts.length === 0) {
        return [{ type: 'text', text: '' }];
    }

    return parts;
}

/**
 * Resolves a prompt input string into an array of content parts.
 * If the input is a valid file or directory path, it reads the content.
 * Otherwise, it treats the input as a raw text string.
 */
export async function resolvePromptInput(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
    try {
        await fsPromises.stat(input);
        // If stat succeeds, it's a file or directory
        return await readPromptInput(input);
    } catch (error: any) {
        // Heuristic Check: Is this likely a file path that doesn't exist?
        
        const hasNewlines = input.includes('\n');
        const hasSpaces = input.includes(' ');
        
        // If it has newlines or spaces, it is almost certainly raw text, not a file path.
        // (We assume users don't pass non-existent file paths containing spaces as arguments often enough to break this)
        if (!hasNewlines && !hasSpaces) {
            // 1. Check for path separators
            const hasPathSeparators = input.includes('/') || input.includes('\\');
            
            // 2. Check for file-like characteristics
            // - Short length (filenames are usually short)
            // - Ends with a file extension pattern (dot followed by 2-5 alphanumeric chars)
            //   We require at least 2 chars to avoid matching "Version 2.0" or "Item 1." as a file.
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
}
