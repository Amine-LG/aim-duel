import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: the browser loads the app from Vite (5173) but the realtime
    // server runs separately (3000). Proxying the Socket.IO path — with
    // `ws: true` so the WebSocket upgrade is forwarded too — lets the client
    // connect to its own origin and reach the backend, exactly like production
    // (where one origin serves both). No CORS, no hardcoded backend URL.
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
