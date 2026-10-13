import { describe, expect, it } from 'vitest';
import { parseJsonData } from '../src/utils/dataLoader.js';

describe('parseJsonData', () => {
    it('parses newline-delimited JSON objects without dropping a row or its body', () => {
        const input = [
            JSON.stringify({ recipientEmail: 'one@example.com', generatedEmail: 'Body one' }),
            JSON.stringify({ recipientEmail: 'two@example.com', generatedEmail: 'Body two' })
        ].join('\n');

        expect(parseJsonData(input)).toEqual([
            { recipientEmail: 'one@example.com', generatedEmail: 'Body one' },
            { recipientEmail: 'two@example.com', generatedEmail: 'Body two' }
        ]);
    });

    it('keeps normal JSON arrays and objects supported', () => {
        expect(parseJsonData('[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
        expect(parseJsonData('{"id":1}')).toEqual([{ id: 1 }]);
    });
});
