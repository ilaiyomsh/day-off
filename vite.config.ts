import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// monday client-side apps are served from a CDN sub-path → relative base.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
});
