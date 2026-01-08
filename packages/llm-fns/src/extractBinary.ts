import OpenAI from 'openai';

/**
 * Extracts an image buffer from a ChatCompletion.
 * Supports both hosted URLs (via fetch) and base64 data URIs.
 */
export async function extractImageBuffer(completion: OpenAI.Chat.Completions.ChatCompletion): Promise<Buffer> {
    const message = completion.choices[0]?.message as any;

    if (message?.images && Array.isArray(message.images) && message.images.length > 0) {
        const imageUrl = message.images[0].image_url.url;
        if (typeof imageUrl === 'string') {
            if (imageUrl.startsWith('http')) {
                const imgRes = await fetch(imageUrl);
                const arrayBuffer = await imgRes.arrayBuffer();
                return Buffer.from(arrayBuffer);
            } else {
                const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
                return Buffer.from(base64Data, 'base64');
            }
        }
    }
    throw new Error("LLM returned no image content.");
}

/**
 * Extracts an audio buffer from a ChatCompletion.
 */
export function extractAudioBuffer(completion: OpenAI.Chat.Completions.ChatCompletion): Buffer {
    const message = completion.choices[0]?.message;

    if (message?.audio && message.audio.data) {
        return Buffer.from(message.audio.data, 'base64');
    }
    throw new Error("LLM returned no audio content.");
}
