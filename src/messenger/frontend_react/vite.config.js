import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // Auth API calls are always POST — bypass GET (page navigation) to index.html
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        bypass: (req) => { if (req.method === 'GET') return '/index.html'; },
      },
      '/chats': { target: 'http://localhost:8000', changeOrigin: true },
      '/profiles': { target: 'http://localhost:8000', changeOrigin: true },
      // /chat is both the React page and the WS endpoint — only proxy WebSocket upgrades
      '/chat': {
        target: 'ws://localhost:8000',
        ws: true,
        bypass: (req) => { if (req.headers.upgrade !== 'websocket') return '/index.html'; },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
})

