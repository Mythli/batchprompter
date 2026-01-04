import OpenAI from 'openai';
import { BoundLlmClient } from '../src/core/BoundLlmClient.js';
export interface SelectionOptions<T> {
    /** Maximum number of items to select */
    maxSelected: number;
    /** Function to format items into content parts for the LLM */
    formatContent: (items: T[]) => Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]>;
    /** Instruction text for the LLM */
    promptPreamble: string;
    /**
     * Offset to subtract from the indices returned by the LLM to get 0-based array indices.
     * Default is 0. Use 1 if the LLM sees a 1-based list (e.g. numbered sprites).
     */
    indexOffset?: number;
    /** Optional callback to capture the raw decision data for debugging */
    onDecision?: (decision: {
        selected_indices: number[];
        reasoning: string;
    }, items: T[], formattedContent: OpenAI.Chat.Completions.ChatCompletionContentPart[]) => Promise<void>;
}
export declare class LlmListSelector {
    private llm;
    constructor(llm: BoundLlmClient);
    select<T>(items: T[], options: SelectionOptions<T>): Promise<T[]>;
}
//# sourceMappingURL=LlmListSelector.d.ts.map