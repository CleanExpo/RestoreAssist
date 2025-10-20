import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import mcp from 'vite-plugin-mcp'  // Temporarily disabled - causing import errors
import path from 'path'

export default defineConfig({
  plugins: [react()],  // mcp() temporarily removed
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
