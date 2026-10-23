import { defineConfig } from 'vitest/config';
import { swManifestPlugin } from './build/sw-plugin';

// Relative base so the same build works on GitHub Pages sub-paths, custom
// domains and inside the Capacitor Android wrapper.
export default defineConfig({
  base: './',
  plugins: [swManifestPlugin()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: { main: 'index.html' },
      output: { manualChunks: { pixi: ['pixi.js'] } },
    },
  },
  server: { host: true, port: 5173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
