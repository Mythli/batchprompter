import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run .ts test files, ignoring stale .js artifacts
    include: ['tests/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Enable type checking before running tests
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json'
    }
  }
});
