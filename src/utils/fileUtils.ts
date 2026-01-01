import fsPromises from 'fs/promises';
import path from 'path';

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
    sanitized = sanitized.replace(/[^a-zA-Z0-9_\-]/g, '');
    
    // 3. Truncate to 100 chars
    return sanitized.substring(0, 100);
}
