import OpenAI from 'openai';

/**
 * Interface for resolving content from strings. 
 * Strings may be raw text, file paths, or directory paths.
 * The library defines the interface; consumers provide implementations.
 */
export interface ContentResolver {
    /**
     * Resolves an input string into content parts.
     * For a file system implementation:
     * - If input is a file path: reads and returns content parts (text, image, audio)
     * - If input is a directory: reads all files and returns concatenated parts
     * - If input is raw text: returns as a text part
     */
    resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;

    /**
     * Reads raw text content from a source.
     * For a file system implementation, reads a file.
     * For a passthrough implementation, returns the input as-is.
     */
    readText(source: string): Promise<string>;
}

/**
 * A passthrough content resolver that treats all strings as raw text.
 * Used when no file system access is needed (e.g., API consumers).
 */
export class PassthroughContentResolver implements ContentResolver {
    async resolve(input: string): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        return [{ type: 'text', text: input }];
    }

    async readText(source: string): Promise<string> {
        return source;
    }
}
