import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwaLite } from './vite.pwa.js';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pwaLite()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('leaflet')) return 'vendor-map';
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (id.includes('react-router')) return 'vendor-router';
          return 'vendor-core';
        },
      },
    },
  },
  shortcuts: [
    {
      name: 'Current Schedule',
      short_name: 'Now',
      description: 'View what is scheduled right now',
      url: '/widget',
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
    },
  ],
});