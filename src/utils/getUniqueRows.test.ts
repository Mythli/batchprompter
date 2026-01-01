import { describe, it, expect } from 'vitest';
import { getUniqueRows } from './getUniqueRows';

describe('getUniqueRows', () => {
    it('should return all rows if limit is greater than or equal to row count', () => {
        const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
        expect(getUniqueRows(rows, 3)).toHaveLength(3);
        expect(getUniqueRows(rows, 5)).toHaveLength(3);
    });

    it('should return empty array if limit is 0', () => {
        const rows = [{ a: 1 }, { a: 2 }];
        expect(getUniqueRows(rows, 0)).toEqual([]);
    });

    it('should prioritize rows that add new unique values', () => {
        // Scenario:
        // Row A: { type: 'fruit', name: 'apple' }
        // Row B: { type: 'fruit', name: 'banana' }
        // Row C: { type: 'vegetable', name: 'carrot' }
        
        // If we pick 1 row:
        // A: 2 new values (fruit, apple)
        // B: 2 new values (fruit, banana)
        // C: 2 new values (vegetable, carrot)
        // Tie-breaking is order dependent (first one found).
        
        // If we pick 2 rows:
        // 1. Pick A (adds 'fruit', 'apple').
        // 2. Remaining B: adds 'banana' (1 new value, 'fruit' is seen).
        // 3. Remaining C: adds 'vegetable', 'carrot' (2 new values).
        // So C should be prioritized over B for the second slot.
        
        const rows = [
            { id: 'A', type: 'fruit', name: 'apple' },
            { id: 'B', type: 'fruit', name: 'banana' },
            { id: 'C', type: 'vegetable', name: 'carrot' }
        ];

        const result = getUniqueRows(rows, 2);
        
        expect(result).toHaveLength(2);
        const ids = result.map(r => r.id);
        
        // We expect A (first pick) and C (highest score after A is picked)
        // Or C (first pick) and A (highest score after C is picked)
        // B should be the one left out because it shares 'fruit' with A.
        expect(ids).toContain('C');
        expect(ids).not.toContain('B');
    });

    it('should fill the limit even if remaining rows add no new information', () => {
        const rows = [
            { val: 'x' },
            { val: 'x' },
            { val: 'x' }
        ];

        const result = getUniqueRows(rows, 2);
        expect(result).toHaveLength(2);
        expect(result[0].val).toBe('x');
        expect(result[1].val).toBe('x');
    });

    it('should handle mixed types by stringifying them', () => {
        // The implementation uses String(val), so 1 and "1" are treated as the same value.
        const rows = [
            { id: 1, val: 100 },
            { id: 2, val: "100" }, // "100" is seen as same as 100
            { id: 3, val: 200 }
        ];

        // Pick 2.
        // 1. Pick id:1 (adds "1", "100").
        // 2. Remaining id:2 (adds "2", "100" -> "100" is seen). Score: 1 (just "2").
        // 3. Remaining id:3 (adds "3", "200"). Score: 2.
        // Should pick id:3 over id:2.
        
        const result = getUniqueRows(rows, 2);
        const ids = result.map(r => r.id);
        
        expect(ids).toContain(1);
        expect(ids).toContain(3);
        expect(ids).not.toContain(2);
    });
});
