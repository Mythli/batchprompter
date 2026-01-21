import { describe, it, expectTypeOf } from 'vitest';
import { Pipeline } from '../src/Pipeline.js';
import { PipelineItem } from '../src/types.js';

/**
 * This file exists to enable Vitest's typecheck feature.
 * Vitest requires at least one *.test-d.ts file to run typechecking.
 * See: https://github.com/vitest-dev/vitest/issues/5868
 */

describe('Type Tests', () => {
    it('PipelineItem should have required properties', () => {
        expectTypeOf<PipelineItem>().toHaveProperty('row');
        expectTypeOf<PipelineItem>().toHaveProperty('history');
        expectTypeOf<PipelineItem>().toHaveProperty('originalIndex');
    });
});
