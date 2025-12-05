import { OutputStrategy } from '../types.js';

export class ResultProcessor {
    /**
     * Applies a result (from a plugin or model) to the current list of rows.
     * Handles merging, column assignment, and explosion.
     */
    static process(
        currentRows: Record<string, any>[], 
        resultData: any, 
        strategy: OutputStrategy
    ): Record<string, any>[] {
        
        // 1. Normalize resultData to an array if we are exploding
        // If explode is true, and resultData is an array, we use it.
        // If explode is true, and resultData is NOT an array, we treat it as [resultData].
        // If explode is false, we treat it as [resultData] (single item applied to row).
        
        let items: any[];
        if (strategy.explode && Array.isArray(resultData)) {
            items = resultData;
        } else {
            items = [resultData];
        }

        const nextRows: Record<string, any>[] = [];

        // 2. Cartesian Product / Application
        for (const row of currentRows) {
            for (const item of items) {
                const newRow = { ...row };

                if (strategy.mode === 'column' && strategy.columnName) {
                    newRow[strategy.columnName] = item;
                } else if (strategy.mode === 'merge') {
                    if (typeof item === 'object' && item !== null) {
                        Object.assign(newRow, item);
                    } else if (strategy.columnName) {
                        // Fallback if they asked to merge a primitive string but provided a column name (via output-column implies merge logic in some contexts, but here we separate them)
                        // Actually, if mode is merge, we expect object. 
                        // If item is primitive, we can't merge it unless we have a key.
                        // But 'merge' usually implies "spread".
                        // If we have a columnName, we treat it as assignment? No, that's 'column' mode.
                        // Let's stick to: Merge = Object.assign.
                        // If item is primitive and mode is merge, we do nothing or warn?
                        // In the old logic: "if (typeof dataToMerge === 'object') Object.assign(row, dataToMerge)"
                        // So we ignore primitives in merge mode.
                    }
                }
                
                nextRows.push(newRow);
            }
        }

        return nextRows;
    }
}
