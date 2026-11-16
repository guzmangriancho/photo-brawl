import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    host: '0.0.0.0',
    proxy: {
      // Same-origin WebSocket for mobile browsers; server still runs on port 8787.
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: false },
    }
  }
});
