import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Inline small assets for offline reliability
    assetsInlineLimit: 4096,
  },
  server: {
    // Dev server proxy for local API testing
    proxy: {
      '/api': {
        target: 'https://restoreassist.com.au',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
