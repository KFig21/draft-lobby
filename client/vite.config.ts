import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const stylesDir = fileURLToPath(new URL('./src/styles', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@styles': stylesDir,
    },
  },
  // @draft-lobby/shared is an npm-workspace symlink into node_modules, so
  // Vite's dependency pre-bundler (esbuild) treats it like a normal
  // dependency and caches its output — edits to shared/src (e.g. adding a
  // reaction emoji) silently don't show up until the cache is invalidated
  // (dev server restart, or deleting node_modules/.vite). Excluding it here
  // keeps it live-reloaded like any other first-party source file.
  optimizeDeps: {
    exclude: ['@draft-lobby/shared'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Make tokens/mixins importable as `@use "variables" as *;` anywhere.
        loadPaths: [stylesDir],
      },
    },
  },
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
});
