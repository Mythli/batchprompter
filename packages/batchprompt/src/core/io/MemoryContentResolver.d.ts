import OpenAI from 'openai';
import { ContentResolver } from './ContentResolver.js';
export declare class MemoryContentResolver implements ContentResolver {
    readText(path: string): Promise<string>;
    resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
}
//# sourceMappingURL=MemoryContentResolver.d.ts.map