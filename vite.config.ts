import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves project sites under /<repo>/. The Pages deploy workflow
// sets GITHUB_PAGES=true; every other target (local dev, preview, Netlify,
// Vercel) builds against the root path.
const base = process.env.GITHUB_PAGES === 'true' ? '/lfp_agent-demo/' : '/';

export default defineConfig({
  base,
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy libraries into separately-cacheable vendor chunks.
        manualChunks: {
          recharts: ['recharts'],
          genai: ['@google/genai'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
