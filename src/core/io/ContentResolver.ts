import OpenAI from 'openai';

export interface ContentResolver {
    /**
     * Resolves a string input (path or text) into content parts.
     * If the input is a file path, it reads the file.
     * If it's a directory, it reads all files.
     * If it's raw text, it returns it as a text part.
     */
    resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
    
    /**
     * Reads a file as a UTF-8 string.
     * Throws if file not found or not readable.
     */
    readText(path: string): Promise<string>;
}
