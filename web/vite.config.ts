import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/ws': { target: API.replace('http', 'ws'), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 2500, sourcemap: false },
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
});
