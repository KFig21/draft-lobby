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
