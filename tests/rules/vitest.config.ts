import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    // Rules tests share one emulator instance; run serially.
    fileParallelism: false,
  },
});
