import OpenAI from 'openai';

/**
 * Detects if the completion contains an image response.
 */
export function isImageResponse(completion: OpenAI.Chat.Completions.ChatCompletion): boolean {
    const message = completion.choices[0]?.message as any;
    if (message?.images && Array.isArray(message.images) && message.images.length > 0) return true;
    if (Array.isArray(message?.content)) {
        return message.content.some((part: any) => part.type === 'image_url');
    }
    return false;
}

/**
 * Detects if the completion contains an audio response.
 */
export function isAudioResponse(completion: OpenAI.Chat.Completions.ChatCompletion): boolean {
    const message = completion.choices[0]?.message as any;
    if (message?.audio) return true;
    if (Array.isArray(message?.content)) {
        return message.content.some((part: any) => part.type === 'input_audio');
    }
    return false;
}

/**
 * Extracts an image buffer from a ChatCompletion.
 * Supports both hosted URLs (via fetch) and base64 data URIs.
 * 
 * @param completion The ChatCompletion object.
 * @param fetchImpl Mandatory fetch implementation for remote resource extraction.
 */
export async function extractImageBuffer(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    fetchImpl: typeof globalThis.fetch
): Promise<Buffer> {
    const message = completion.choices[0]?.message as any;
    let imageUrl: string | undefined;

    // 1. Check OpenRouter/Provider extension field
    if (message?.images && Array.isArray(message.images) && message.images.length > 0) {
        imageUrl = message.images[0].image_url?.url || message.images[0].url;
    } 
    // 2. Check standard content parts
    else if (Array.isArray(message?.content)) {
        const part = message.content.find((p: any) => p.type === 'image_url');
        imageUrl = part?.image_url?.url;
    }

    if (imageUrl) {
        if (imageUrl.startsWith('http')) {
            const imgRes = await fetchImpl(imageUrl);
            const arrayBuffer = await imgRes.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } else {
            const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
            return Buffer.from(base64Data, 'base64');
        }
    }

    throw new Error("LLM returned no image content.");
}

/**
 * Extracts an audio buffer from a ChatCompletion.
 */
export function extractAudioBuffer(completion: OpenAI.Chat.Completions.ChatCompletion): Buffer {
    const message = completion.choices[0]?.message as any;
    let audioData: string | undefined;

    // 1. Check standard OpenAI audio field
    if (message?.audio?.data) {
        audioData = message.audio.data;
    }
    // 2. Check standard content parts
    else if (Array.isArray(message?.content)) {
        const part = message.content.find((p: any) => p.type === 'input_audio');
        audioData = part?.input_audio?.data;
    }

    if (audioData) {
        return Buffer.from(audioData, 'base64');
    }

    throw new Error("LLM returned no audio content.");
}
