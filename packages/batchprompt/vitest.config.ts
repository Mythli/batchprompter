import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      'llm-fns': path.resolve(__dirname, '../llm-fns/src/index.ts')
    }
  }
});
