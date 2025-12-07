import { OutputStrategy, PipelineItem } from '../types.js';

export class ResultProcessor {
    /**
     * Applies a result (from a plugin or model) to the current list of PipelineItems.
     * 
     * 1. Always updates `item.workspace[namespace]` with the result (or exploded slice).
     * 2. Conditionally updates `item.row` based on the OutputStrategy.
     * 3. Handles explosion by creating multiple PipelineItems.
     */
    static process(
        currentItems: PipelineItem[], 
        resultData: any, 
        strategy: OutputStrategy,
        namespace: string
    ): PipelineItem[] {
        
        // 1. Normalize resultData to an array if we are exploding
        let items: any[];
        if (strategy.explode && Array.isArray(resultData)) {
            console.log(`[ResultProcessor] Exploding ${resultData.length} items for namespace '${namespace}'`);
            items = resultData;
        } else {
            items = [resultData];
        }

        const nextItems: PipelineItem[] = [];

        // 2. Cartesian Product / Application
        for (const item of currentItems) {
            for (const resultItem of items) {
                // Deep clone the item to ensure isolation
                const newItem: PipelineItem = {
                    row: { ...item.row },
                    workspace: { ...item.workspace },
                    stepHistory: [...item.stepHistory],
                    history: [...item.history],
                    originalIndex: item.originalIndex
                };

                // A. Always update Workspace (Transient Data)
                // This ensures {{webSearch}} is available even if not exported to CSV
                newItem.workspace[namespace] = resultItem;

                // B. Conditionally update Row (Persistent Data)
                if (strategy.mode === 'column' && strategy.columnName) {
                    newItem.row[strategy.columnName] = resultItem;
                } else if (strategy.mode === 'merge') {
                    if (typeof resultItem === 'object' && resultItem !== null) {
                        Object.assign(newItem.row, resultItem);
                    }
                }
                // If mode === 'ignore', we do nothing to newItem.row

                nextItems.push(newItem);
            }
        }

        return nextItems;
    }
}
