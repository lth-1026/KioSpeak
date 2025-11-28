import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    sequence: {
      shuffle: false,
    },
    fileParallelism: false,  // Run test files sequentially
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
