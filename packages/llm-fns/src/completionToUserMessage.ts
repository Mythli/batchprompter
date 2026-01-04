import OpenAI from 'openai';

/**
 * Converts a completion result (string, object, or OpenAI ChatCompletion) into a chat message parameter.
 * 
 * @param content The generated content (string, object, or ChatCompletion).
 * @param role The role to assign to the message. Defaults to 'assistant'.
 */
export function completionToMessage(
    content: string | OpenAI.Chat.Completions.ChatCompletion | any,
    role: 'assistant' | 'user' | 'system' = 'assistant'
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
        
        // If we are just extracting the message, we usually want to keep the tool calls/etc.
        // But if we are forcing a role (e.g. turning an assistant output into a user example),
        // we might just want the content.
        // For the purpose of IterativeRefiner history, we want the full fidelity of the assistant's response.
        
        return {
            role, // Allow overriding role, but usually 'assistant'
            content: message.content,
            tool_calls: message.tool_calls,
            function_call: message.function_call,
            refusal: message.refusal
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
    }

    // Handle String
    if (typeof content === 'string') {
        return { role, content };
    }

    // Handle null/undefined
    if (content === null || content === undefined) {
        return { role, content: null };
    }

    // Handle other objects (serialize)
    return { role, content: JSON.stringify(content) };
}
