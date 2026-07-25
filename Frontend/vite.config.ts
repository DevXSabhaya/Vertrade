import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Chosen to avoid colliding with other local projects' dev servers on
    // the default 5173/5174. Not load-bearing for CORS: the backend's dev
    // CORS policy accepts any http://localhost:<port> origin, so this only
    // reduces how often Vite has to silently fall back to a different port.
    port: 5183,
  },
  build: {
    // Keep vendor chunks separate from app code so a route-level code change
    // doesn't invalidate the (much larger, much less frequently changing)
    // React/React Query/Router bundle in returning visitors' caches.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('/react/') || id.includes('/react-dom/')) {
              return 'vendor'
            }
            if (id.includes('@tanstack')) {
              return 'query'
            }
          }
          return undefined
        },
      },
    },
  },
})
