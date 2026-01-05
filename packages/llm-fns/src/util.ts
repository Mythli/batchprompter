import OpenAI from "openai";

export function countChars(message: OpenAI.Chat.Completions.ChatCompletionMessageParam): number {
    if (!message.content) return 0;
    if (typeof message.content === 'string') {
        return message.content.length;
    }
    if (Array.isArray(message.content)) {
        return message.content.reduce((sum, part) => {
            if (part.type === 'text') {
                return sum + part.text.length;
            }
            if (part.type === 'image_url') {
                return sum + 2500;
            }
            if (part.type === 'input_audio') {
                // Use base64 length as a proxy for size/cost
                return sum + (part.input_audio.data.length || 0);
            }
            return sum;
        }, 0);
    }
    return 0;
}

export function truncateSingleMessage(message: OpenAI.Chat.Completions.ChatCompletionMessageParam, charLimit: number): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    const TRUNCATION_SUFFIX = '...[truncated]';
    const messageCopy = JSON.parse(JSON.stringify(message));

    if (charLimit <= 0) {
        messageCopy.content = null;
        return messageCopy;
    }

    if (!messageCopy.content || countChars(messageCopy) <= charLimit) {
        return messageCopy;
    }

    if (typeof messageCopy.content === 'string') {
        let newContent = messageCopy.content;
        if (newContent.length > charLimit) {
            if (charLimit > TRUNCATION_SUFFIX.length) {
                newContent = newContent.substring(0, charLimit - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
            } else {
                newContent = newContent.substring(0, charLimit);
            }
        }
        messageCopy.content = newContent;
        return messageCopy;
    }

    if (Array.isArray(messageCopy.content)) {
        const textParts = messageCopy.content.filter((p: any) => p.type === 'text');
        const imageParts = messageCopy.content.filter((p: any) => p.type === 'image_url');
        const audioParts = messageCopy.content.filter((p: any) => p.type === 'input_audio');
        
        let combinedText = textParts.map((p: any) => p.text).join('\n');
        let keptImages = [...imageParts];
        let keptAudio = [...audioParts];

        const calculateSize = () => 
            combinedText.length + 
            (keptImages.length * 2500) + 
            keptAudio.reduce((s, a: any) => s + (a.input_audio?.data?.length || 0), 0);

        while (calculateSize() > charLimit) {
            // Drop heavy media first. Audio is likely largest, then images.
            if (keptAudio.length > 0) {
                keptAudio.pop();
            } else if (keptImages.length > 0) {
                keptImages.pop();
            } else {
                break; // Only text left
            }
        }

        const currentSize = calculateSize();
        const textCharLimit = charLimit - (currentSize - combinedText.length);

        if (combinedText.length > textCharLimit) {
            if (textCharLimit > TRUNCATION_SUFFIX.length) {
                combinedText = combinedText.substring(0, textCharLimit - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
            } else if (textCharLimit >= 0) {
                combinedText = combinedText.substring(0, textCharLimit);
            } else {
                combinedText = "";
            }
        }

        const newContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        if (combinedText) {
            newContent.push({ type: 'text', text: combinedText });
        }
        newContent.push(...keptImages);
        newContent.push(...keptAudio);
        messageCopy.content = newContent;
    }

    return messageCopy;
}


export function truncateMessages(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], limit: number): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    let totalChars = otherMessages.reduce((sum: number, msg) => sum + countChars(msg), 0);

    if (totalChars <= limit) {
        return messages;
    }

    const mutableOtherMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = JSON.parse(JSON.stringify(otherMessages));
    let excessChars = totalChars - limit;

    for (let i = 1; i < mutableOtherMessages.length; i++) {
        if (excessChars <= 0) break;

        const message = mutableOtherMessages[i];
        const messageChars = countChars(message);
        const charsToCut = Math.min(excessChars, messageChars);

        const newCharCount = messageChars - charsToCut;
        mutableOtherMessages[i] = truncateSingleMessage(message, newCharCount);

        excessChars -= charsToCut;
    }

    if (excessChars > 0) {
        const firstMessage = mutableOtherMessages[0];
        const firstMessageChars = countChars(firstMessage);
        const charsToCut = Math.min(excessChars, firstMessageChars);
        const newCharCount = firstMessageChars - charsToCut;
        mutableOtherMessages[0] = truncateSingleMessage(firstMessage, newCharCount);
    }

    const finalMessages = mutableOtherMessages.filter(msg => countChars(msg) > 0);

    return systemMessage ? [systemMessage, ...finalMessages] : finalMessages;
}

export function concatMessageText(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): string {
    const textParts: string[] = [];
    for (const message of messages) {
        if (message.content) {
            if (typeof message.content === 'string') {
                textParts.push(message.content);
            } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === 'text') {
                        textParts.push(part.text);
                    } else if (part.type === 'image_url') {
                        textParts.push('[IMAGE]');
                    } else if (part.type === 'input_audio') {
                        textParts.push('[AUDIO]');
                    }
                }
            }
        }
    }
    return textParts.join(' ');
}

/**
 * Generates a concise summary of a prompt's content for logging purposes.
 * Attempts to show the start, middle, and end of the combined message text.
 * 
 * @param messages The messages to summarize.
 * @param maxLength The maximum length of the resulting summary string. Defaults to 200.
 */
export function getPromptSummary(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], maxLength: number = 200): string {
    const fullText = concatMessageText(messages);
    const cleanedText = fullText.replace(/\s+/g, ' ').trim();

    if (cleanedText.length <= maxLength) {
        return cleanedText;
    }

    // Ensure we have at least enough space for an ellipsis
    const safeMaxLength = Math.max(3, maxLength);

    // If maxLength is too small for a complex summary, just truncate at the end
    if (safeMaxLength < 30) {
        return cleanedText.substring(0, safeMaxLength - 3) + '...';
    }

    // We want to construct: [start] ... [middle] ... [end]
    // Total length = partSize * 3 + 6 (for two "...")
    const totalEllipsisLen = 6;
    const partSize = Math.floor((safeMaxLength - totalEllipsisLen) / 3);

    const start = cleanedText.substring(0, partSize);
    const end = cleanedText.substring(cleanedText.length - partSize);

    const midIndex = Math.floor(cleanedText.length / 2);
    const midStart = midIndex - Math.floor(partSize / 2);
    const middle = cleanedText.substring(midStart, midStart + partSize);

    // Overlap/Proximity check:
    // If the gaps between parts in the original text are smaller than the ellipsis (3 chars),
    // it means the segments are practically continuous. In this case, a 3-part summary 
    // is misleading. Fall back to a simpler "Start...End" summary.
    const firstGap = midStart - partSize;
    const secondGap = (cleanedText.length - partSize) - (midStart + partSize);

    if (firstGap < 3 || secondGap < 3) {
        const singleEllipsisLen = 3;
        const halfSize = Math.floor((safeMaxLength - singleEllipsisLen) / 2);
        return cleanedText.substring(0, halfSize) + '...' + cleanedText.substring(cleanedText.length - halfSize);
    }

    return `${start}...${middle}...${end}`;
}
