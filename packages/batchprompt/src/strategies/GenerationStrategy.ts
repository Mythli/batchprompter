import OpenAI from 'openai';
import { PluginPacket } from '../plugins/types.js';

export interface GenerationResult extends PluginPacket {
    historyMessage?: OpenAI.Chat.Completions.ChatCompletionMessageParam;
}

export interface GenerationStrategy {
    execute(cacheSalt?: string | number): Promise<PluginPacket[]>;
}
