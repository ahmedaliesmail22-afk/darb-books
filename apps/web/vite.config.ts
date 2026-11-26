import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: resolve(__dirname, '../../public'),
  resolve: {
    alias: {
      '@darb/book-schema': resolve(__dirname, '../../packages/book-schema/src/index.ts'),
      '@darb/book-engine/styles': resolve(__dirname, '../../packages/book-engine/src/styles'),
      '@darb/book-engine': resolve(__dirname, '../../packages/book-engine/src/index.ts'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../../dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three-vendor';
          }
          if (id.includes('node_modules/react')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/zod')) {
            return 'schema-vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
