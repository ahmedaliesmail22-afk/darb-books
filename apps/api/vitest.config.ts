import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@darb/book-schema': resolve(__dirname, '../../packages/book-schema/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
