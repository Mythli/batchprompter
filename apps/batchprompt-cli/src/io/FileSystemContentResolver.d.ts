import OpenAI from 'openai';
import { ContentResolver } from 'batchprompt';
export declare class FileSystemContentResolver implements ContentResolver {
    readText(filePath: string): Promise<string>;
    resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
    private loadFile;
    private loadDirectory;
    private getPartType;
}
//# sourceMappingURL=FileSystemContentResolver.d.ts.map