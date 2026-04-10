import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'leaflet-markercluster': 'leaflet.markercluster',
    },
  },
  server: {
    proxy: {
      // Take GeoJSON server (must be listed BEFORE /api catch-all)
      '/api/take': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/take/, '/api'),
      },
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8001',
        ws: true,
      },
    },
    watch: {
      ignored: ['**/.venv/**', '**/venv/**', '**/node_modules/**', '**/backend/**'],
    },
  },
})
