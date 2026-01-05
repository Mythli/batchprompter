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
            let variationCounter = 0;

            // Iterate over packets (Topology Expansion)
            // Each packet represents a distinct result from the previous step/plugin execution
            packets.forEach((packet) => {
                
                // Check for Data Expansion (strategy.explode = true AND data is array)
                if (strategy.explode && Array.isArray(packet.data)) {
                    // Data Explosion
                    let dataArray = packet.data;
                    
                    // Apply limit/offset to the data array
                    if (strategy.offset !== undefined && strategy.offset > 0) {
                        dataArray = dataArray.slice(strategy.offset);
                    }
                    if (strategy.limit !== undefined && strategy.limit > 0) {
                        dataArray = dataArray.slice(0, strategy.limit);
                    }

                    dataArray.forEach((dataItem: any) => {
                        const newItem = ResultProcessor.cloneItem(item);
                        newItem.variationIndex = variationCounter++;
                        
                        // Apply Data
                        newItem.workspace[namespace] = dataItem;
                        
                        // Apply Content
                        newItem.accumulatedContent.push(...packet.contentParts);
                        
                        // Update Row
                        ResultProcessor.updateRow(newItem, dataItem, strategy, namespace);
                        
                        // Attach source packet for post-processing (history updates)
                        (newItem as any)._sourcePacket = packet;

                        nextItems.push(newItem);
                    });

                } else {
                    // No Data Explosion (1 Packet -> 1 Row)
                    const newItem = ResultProcessor.cloneItem(item);
                    newItem.variationIndex = variationCounter++;

                    newItem.workspace[namespace] = packet.data;
                    newItem.accumulatedContent.push(...packet.contentParts);
                    
                    ResultProcessor.updateRow(newItem, packet.data, strategy, namespace);
                    
                    // Attach source packet for post-processing (history updates)
                    (newItem as any)._sourcePacket = packet;

                    nextItems.push(newItem);
                }
            });
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

    private static updateRow(item: PipelineItem, data: any, strategy: OutputStrategy, namespace: string) {
        // Unwrap single-element arrays for both column and merge operations
        // This handles the common case of a single-packet result (e.g. model output)
        let dataToMerge = data;
        if (Array.isArray(data) && data.length === 1) {
            dataToMerge = data[0];
        }

        // Also unwrap if the packet data itself is a single-element array
        // This handles plugins that return a list of results (like WebSearch)
        // when that list happens to contain exactly one item.
        if (Array.isArray(dataToMerge) && dataToMerge.length === 1) {
            dataToMerge = dataToMerge[0];
        }

        if (strategy.mode === 'column' && strategy.column) {
            item.row[strategy.column] = dataToMerge;
        } else if (strategy.mode === 'merge') {
            // Special handling for model output: Merge at root if it's an object
            // This ensures model results like { location: "Berlin" } become row.location
            // instead of row.modelOutput.location
            if (namespace === 'modelOutput' && typeof dataToMerge === 'object' && dataToMerge !== null && !Array.isArray(dataToMerge)) {
                Object.assign(item.row, dataToMerge);
            } else {
                // Plugins or primitives: Use namespace to avoid collisions
                item.row[namespace] = dataToMerge;
            }
        }
    }
}
