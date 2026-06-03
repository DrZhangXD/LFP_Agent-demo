import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For GitHub Pages the deploy workflow sets GITHUB_PAGES=true and we use a
// relative base ('./') so assets resolve correctly no matter what path/casing
// the project site is served under (the repo name 'LFP_Agent-demo' is
// mixed-case, and an absolute base must match it exactly). The app has no
// client-side router, so a relative base is safe. Other targets (local dev,
// preview, Netlify, Vercel) build against the root path.
const base = process.env.GITHUB_PAGES === 'true' ? './' : '/';

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
