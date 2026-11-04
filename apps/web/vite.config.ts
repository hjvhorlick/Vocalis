import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The platform warning mentions "server.allowe" which is likely a typo for "server.allowedHosts" or similar in the platform's detection logic.
// In Vite, we set allowedHosts to true or a list including the preview host.
// We also ensure the host is 0.0.0.0.

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    cors: true,
    allowedHosts: [
      '5173-ig36biymqf4ashthbb4mp.e2b.app',
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      true
    ],
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  // Additional fix for some Vite versions where allowedHosts is inside server object directly
  // but we already have it there.
})
