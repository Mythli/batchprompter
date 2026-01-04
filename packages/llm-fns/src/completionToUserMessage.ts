import OpenAI from 'openai';

/**
 * Converts an OpenAI ChatCompletion object into an assistant message parameter.
 * Handles text, audio, tool calls, and custom image attachments.
 *
 * @param completion The ChatCompletion object.
 * @returns An OpenAI ChatCompletionMessageParam with role 'assistant'.
 * @throws Error if the input is not a valid ChatCompletion object.
 */
export function completionToMessage(
    completion: OpenAI.Chat.Completions.ChatCompletion
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    if (!completion.choices || completion.choices.length === 0) {
        throw new Error("Invalid completion object: No choices found.");
    }

    const message = completion.choices[0].message;

    // Base message structure
    const messageParam: any = {
        role: 'assistant',
        refusal: message.refusal,
        tool_calls: message.tool_calls,
        function_call: message.function_call,
    };

    // Handle Audio (Standard OpenAI)
    if (message.audio) {
        messageParam.audio = message.audio;
    }

    // Handle Content & Images (Parts)
    const contentParts: any[] = [];

    // 1. Existing Text Content
    if (message.content) {
        if (typeof message.content === 'string') {
            contentParts.push({ type: 'text', text: message.content });
        } else if (Array.isArray(message.content)) {
            // Handle potential array content in completion
            contentParts.push(...message.content);
        }
    }

    // 2. Custom Images (OpenRouter / Custom Provider extension)
    // The user snippet shows: message.images[].image_url.url
    if ((message as any).images && Array.isArray((message as any).images)) {
        for (const img of (message as any).images) {
            // Handle OpenRouter format: { image_url: { url: "..." } }
            if (img.image_url && img.image_url.url) {
                contentParts.push({ 
                    type: 'image_url', 
                    image_url: { url: img.image_url.url } 
                });
            } 
            // Handle potential flat format (legacy or other providers): { url: "..." }
            else if (img.url) {
                contentParts.push({ 
                    type: 'image_url', 
                    image_url: { url: img.url } 
                });
            }
        }
    }

    // 3. Custom Audio (Extension for providers returning audio in a list or custom format)
    // We map this to 'input_audio' content parts to preserve the data in the history
    // in a way that compatible clients (and our countChars) can understand.
    if ((message as any).audio && Array.isArray((message as any).audio)) {
        for (const aud of (message as any).audio) {
            if (aud.data) {
                contentParts.push({
                    type: 'input_audio',
                    input_audio: {
                        data: aud.data,
                        format: aud.format || 'wav'
                    }
                });
            }
        }
    }

    // Assign content
    if (contentParts.length > 0) {
        // If we have mixed content or images, use array format.
        // If we only have text, we could use string, but array is safer if we want to be uniform.
        // However, standard OpenAI assistant messages prefer string for simple text.
        if (contentParts.length === 1 && contentParts[0].type === 'text') {
            messageParam.content = contentParts[0].text;
        } else {
            messageParam.content = contentParts;
        }
    } else {
        messageParam.content = null;
    }

    return messageParam as OpenAI.Chat.Completions.ChatCompletionMessageParam;
}
