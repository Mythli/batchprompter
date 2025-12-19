import OpenAI from 'openai';
import { z } from 'zod';
import { BoundLlmClient } from '../core/BoundLlmClient.js';

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
    onDecision?: (decision: { selected_indices: number[], reasoning: string }, items: T[], formattedContent: OpenAI.Chat.Completions.ChatCompletionContentPart[]) => Promise<void>;
}

export class LlmListSelector {
    constructor(private llm: BoundLlmClient) {}

    async select<T>(items: T[], options: SelectionOptions<T>): Promise<T[]> {
        if (items.length === 0) return [];

        const { maxSelected, formatContent, promptPreamble, indexOffset = 0, onDecision } = options;

        // 1. Generate Content
        const contentParts = await formatContent(items);

        // 2. Define Schema
        const SelectionSchema = z.object({
            selected_indices: z.array(z.number())
                .describe(`The indices of the selected items. Select up to ${maxSelected} items.`),
            reasoning: z.string().describe("Reasoning for the selection")
        });

        // 3. Construct Prompt
        const promptParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: promptPreamble },
            ...contentParts
        ];

        // 4. Execute LLM
        const response = await this.llm.promptZod(
            { suffix: promptParts },
            SelectionSchema
        );

        if (onDecision) {
            await onDecision(response, items, contentParts);
        }

        // 5. Map Indices & Filter
        const selectedItems: T[] = [];
        
        // Deduplicate indices just in case
        const uniqueIndices = new Set(response.selected_indices);
        
        for (const rawIndex of uniqueIndices) {
            const arrayIndex = rawIndex - indexOffset;
            if (arrayIndex >= 0 && arrayIndex < items.length) {
                selectedItems.push(items[arrayIndex]);
            }
        }

        // Enforce limit
        return selectedItems.slice(0, maxSelected);
    }
}
