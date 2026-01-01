export function getUniqueRows(rows: Record<string, any>[], limit: number): Record<string, any>[] {
    // If we want more or equal rows than we have, just return all of them.
    if (limit >= rows.length) {
        return rows;
    }

    const selectedRows: Record<string, any>[] = [];
    // We'll use a Set to track all unique stringified values we've "collected" so far.
    const seenValues = new Set<string>();
    
    // Work with a copy so we can splice out selected rows
    const remainingRows = [...rows];

    while (selectedRows.length < limit && remainingRows.length > 0) {
        let bestRowIndex = -1;
        let bestScore = -1;

        for (let i = 0; i < remainingRows.length; i++) {
            const row = remainingRows[i];
            let score = 0;

            // Calculate score: number of new unique values this row contributes
            for (const key in row) {
                if (Object.prototype.hasOwnProperty.call(row, key)) {
                    const val = row[key];
                    const stringVal = String(val);
                    if (!seenValues.has(stringVal)) {
                        score++;
                    }
                }
            }

            // We want to maximize the score.
            if (score > bestScore) {
                bestScore = score;
                bestRowIndex = i;
            }
        }

        // Optimization: If the best row we found adds 0 new information,
        // then all remaining rows add 0 new information.
        // We can just pick the next N rows to fill the quota and stop.
        if (bestScore <= 0) {
            const needed = limit - selectedRows.length;
            const toAdd = remainingRows.slice(0, needed);
            selectedRows.push(...toAdd);
            break;
        }

        if (bestRowIndex !== -1) {
            const bestRow = remainingRows[bestRowIndex];
            selectedRows.push(bestRow);

            // Mark its values as seen
            for (const key in bestRow) {
                if (Object.prototype.hasOwnProperty.call(bestRow, key)) {
                    const val = String(bestRow[key]);
                    seenValues.add(val);
                }
            }

            // Remove from pool
            remainingRows.splice(bestRowIndex, 1);
        }
    }

    return selectedRows;
}
