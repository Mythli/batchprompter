import { describe, expect, it } from 'vitest';
import { RawModelConfigSchema } from '../src/config/model.js';

describe('RawModelConfigSchema', () => {
    it('accepts max reasoning effort', () => {
        const parsed = RawModelConfigSchema.parse({
            model: 'deepseek/deepseek-v4-flash-0731',
            thinkingLevel: 'max'
        });

        expect(parsed).toMatchObject({
            model: 'deepseek/deepseek-v4-flash-0731',
            thinkingLevel: 'max'
        });
    });
});
