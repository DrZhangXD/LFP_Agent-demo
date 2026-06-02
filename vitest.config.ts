import path from 'path';
import { defineConfig } from 'vitest/config';

// DSP / filter / EDF logic is pure TypeScript, so tests run in a Node
// environment with no DOM. The EDF parser is tested via parseEDFBuffer
// (ArrayBuffer in, no FileReader needed).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
