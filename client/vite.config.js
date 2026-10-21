import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The API runs separately in development; the browser only ever talks to this origin.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
