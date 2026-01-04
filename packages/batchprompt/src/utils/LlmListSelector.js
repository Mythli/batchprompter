import { z } from 'zod';
export class LlmListSelector {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    async select(items, options) {
        if (items.length === 0)
            return [];
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
        const promptParts = [
            { type: 'text', text: promptPreamble },
            ...contentParts
        ];
        // 4. Execute LLM
        const response = await this.llm.promptZod({ suffix: promptParts }, SelectionSchema);
        if (onDecision) {
            await onDecision(response, items, contentParts);
        }
        // 5. Map Indices & Filter
        const selectedItems = [];
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
//# sourceMappingURL=LlmListSelector.js.map