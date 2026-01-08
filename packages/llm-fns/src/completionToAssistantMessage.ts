import OpenAI from 'openai';

/**
 * Converts an OpenAI ChatCompletion object into an assistant message parameter.
 * Handles text, audio, refusals, tool calls, and custom image attachments.
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
    };

    // Preserve standard fields
    if (message.content !== undefined) messageParam.content = message.content;
    if (message.refusal !== undefined) messageParam.refusal = message.refusal;
    if (message.tool_calls !== undefined) messageParam.tool_calls = message.tool_calls;
    if (message.function_call !== undefined) messageParam.function_call = message.function_call;

    // Handle Content Normalization for Extensions (Images/Audio)
    // If the provider returned images or audio in top-level fields (like OpenRouter or OpenAI Audio),
    // we merge them into the content parts array to ensure they are preserved in history.
    const images = (message as any).images;
    const audio = (message as any).audio;

    if ((images && Array.isArray(images) && images.length > 0) || (audio && audio.data)) {
        let parts: any[] = [];

        // Convert existing content to parts if it's a string
        if (typeof messageParam.content === 'string') {
            parts.push({ type: 'text', text: messageParam.content });
        } else if (Array.isArray(messageParam.content)) {
            parts = [...messageParam.content];
        }

        // Add images from extension field if not already present in parts
        if (images && Array.isArray(images)) {
            for (const img of images) {
                const url = img.image_url?.url || img.url;
                if (url && !parts.some(p => p.type === 'image_url' && p.image_url?.url === url)) {
                    parts.push({
                        type: 'image_url',
                        image_url: { url }
                    });
                }
            }
        }

        // Add audio from extension field if not already present in parts
        if (audio && audio.data) {
            if (!parts.some(p => p.type === 'input_audio' && p.input_audio?.data === audio.data)) {
                parts.push({
                    type: 'input_audio',
                    input_audio: {
                        data: audio.data,
                        format: audio.format || undefined
                    }
                });
            }
        }

        if (parts.length > 0) {
            // If we only have one text part, we can keep it as a string for simplicity,
            // but if we have media, we must use the array format.
            if (parts.length === 1 && parts[0].type === 'text') {
                messageParam.content = parts[0].text;
            } else {
                messageParam.content = parts;
            }
        }
    }

    return messageParam as OpenAI.Chat.Completions.ChatCompletionMessageParam;
}
