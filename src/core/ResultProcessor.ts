import { OutputStrategy, PipelineItem } from '../types.js';
import { PluginPacket } from '../plugins/types.js';

export class ResultProcessor {
    /**
     * Applies a result (from a plugin or model) to the current list of PipelineItems.
     * 
     * 1. Handles flow control (Filter/Enrich/Explode) based on the result packets.
     * 2. Updates `item.workspace[namespace]` and `item.accumulatedContent`.
     * 3. Conditionally updates `item.row` based on the OutputStrategy.
     */
    static process(
        currentItems: PipelineItem[], 
        packets: PluginPacket[], 
        strategy: OutputStrategy,
        namespace: string
    ): PipelineItem[] {
        
        const nextItems: PipelineItem[] = [];

        // If no packets (Filter), we return empty nextItems (Drop).
        if (packets.length === 0) {
            return nextItems;
        }

        for (const item of currentItems) {
            if (strategy.explode) {
                // EXPLODE: Create one new item per packet
                packets.forEach((packet, index) => {
                    const newItem = ResultProcessor.cloneItem(item);
                    
                    // Set variation index (0-based)
                    newItem.variationIndex = index;

                    // Apply Data (Single Object)
                    newItem.workspace[namespace] = packet.data;
                    
                    // Apply Content (Specific Content)
                    newItem.accumulatedContent.push(...packet.contentParts);

                    // Apply Row Update
                    ResultProcessor.updateRow(newItem, packet.data, strategy);

                    nextItems.push(newItem);
                });
            } else {
                // MERGE: Keep one item, merge all packets
                const newItem = ResultProcessor.cloneItem(item);

                // Data: Array of objects
                const mergedData = packets.map(p => p.data);
                newItem.workspace[namespace] = mergedData;

                // Content: All content parts concatenated
                const allContent = packets.flatMap(p => p.contentParts);
                newItem.accumulatedContent.push(...allContent);

                // Row Update
                ResultProcessor.updateRow(newItem, mergedData, strategy);

                nextItems.push(newItem);
            }
        }

        return nextItems;
    }

    private static cloneItem(item: PipelineItem): PipelineItem {
        return {
            row: { ...item.row },
            workspace: { ...item.workspace },
            stepHistory: [...item.stepHistory],
            history: [...item.history],
            originalIndex: item.originalIndex,
            variationIndex: item.variationIndex,
            accumulatedContent: [...item.accumulatedContent]
        };
    }

    private static updateRow(item: PipelineItem, data: any, strategy: OutputStrategy) {
        if (strategy.mode === 'column' && strategy.columnName) {
            item.row[strategy.columnName] = data;
        } else if (strategy.mode === 'merge') {
            if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                Object.assign(item.row, data);
            }
        }
    }
}
