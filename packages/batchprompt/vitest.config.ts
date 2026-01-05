import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      'llm-fns': path.resolve(__dirname, '../llm-fns/src/index.ts')
    },
    // Only run .ts test files, ignoring stale .js artifacts
    include: ['tests/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.js']
  }
});
