import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
const fromRepository = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRepository('./frontend'),
  envDir: fromRepository('./'),
  publicDir: fromRepository('./public'),
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: fromRepository('./dist'),
    emptyOutDir: true,
    // The lazy Three.js chunk is 506 kB minified and about 127 kB over gzip.
    chunkSizeWarningLimit: 525,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) {
            return 'three-vendor';
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});
