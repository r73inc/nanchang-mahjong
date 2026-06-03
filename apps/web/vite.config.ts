import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Strip the /api prefix before forwarding to the NestJS server.
      // FE calls /api/auth/signin  →  API receives /auth/signin
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Forward Socket.IO handshake + WebSocket traffic to the NestJS server.
      // socket.io-client connects to the current host; Vite proxies to localhost:3001.
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true, // enable WebSocket proxying
      },
    },
  },
});
