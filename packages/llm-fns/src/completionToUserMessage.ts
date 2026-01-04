import OpenAI from 'openai';

/**
 * Converts a completion result (string, object, or OpenAI ChatCompletion) into an assistant message parameter.
 *
 * @param content The generated content (string, object, or ChatCompletion).
 * @returns An OpenAI ChatCompletionMessageParam with role 'assistant'.
 * @throws Error if the content cannot be converted to a valid assistant message.
 */
export function completionToMessage(
    content: string | OpenAI.Chat.Completions.ChatCompletion | any
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    // Handle OpenAI ChatCompletion object
    if (
        content &&
        typeof content === 'object' &&
        'choices' in content &&
        Array.isArray(content.choices) &&
        content.choices.length > 0 &&
        content.choices[0].message
    ) {
        const message = content.choices[0].message;

        // We only care about content (text/image/audio) for the history.
        // We explicitly strip tool_calls/function_call as requested.

        return {
            role: 'assistant',
            content: message.content,
            audio: message.audio,
            refusal: message.refusal
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
    }

    // Handle String
    if (typeof content === 'string') {
        return { role: 'assistant', content };
    }

    // Handle null/undefined - technically valid for assistant messages if they have tool calls,
    // but since we are stripping tool calls, a null content is invalid unless it has audio/refusal (which we can't guess here).
    // However, if the input was a raw string/object that is null, we can't make a message out of it.
    if (content === null || content === undefined) {
        throw new Error("Cannot convert null or undefined content to an assistant message.");
    }

    // Handle other objects (serialize)
    return { role: 'assistant', content: JSON.stringify(content) };
}
