import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
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
