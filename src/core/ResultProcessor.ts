import { OutputStrategy, PipelineItem } from '../types.js';

export class ResultProcessor {
    /**
     * Applies a result (from a plugin or model) to the current list of PipelineItems.
     * 
     * 1. Always updates `item.workspace[namespace]` with the result (or exploded slice).
     * 2. Conditionally updates `item.row` based on the OutputStrategy.
     * 3. Handles flow control (Filter/Enrich/Explode) based on the result array length.
     */
    static process(
        currentItems: PipelineItem[], 
        resultData: any, 
        strategy: OutputStrategy,
        namespace: string
    ): PipelineItem[] {
        
        // 1. Normalize resultData to an array
        // If resultData is undefined/null, we treat it as an empty array (Filter/Drop)
        // unless it's the model output which might be a single object/string.
        // However, PluginRunner guarantees arrays for plugins.
        // For Model output, it's usually a single item, so we wrap it.
        
        let items: any[];
        if (Array.isArray(resultData)) {
            items = resultData;
        } else if (resultData !== undefined && resultData !== null) {
            items = [resultData];
        } else {
            items = [];
        }

        const nextItems: PipelineItem[] = [];

        // 2. Cartesian Product / Application
        // If items is empty (Filter), this loop doesn't run, and we return empty nextItems (Drop).
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
