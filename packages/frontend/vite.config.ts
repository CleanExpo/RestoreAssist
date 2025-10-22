/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import mcp from 'vite-plugin-mcp'  // Temporarily disabled - causing import errors
import path from 'path'
import { sentryPlugin } from './sentry.config'

export default defineConfig({
  plugins: [
    react(),
    // mcp() temporarily removed
    // Add Sentry plugin for production builds
    process.env.NODE_ENV === 'production' && sentryPlugin,
  ].filter(Boolean),
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e-claude/**', // Exclude Playwright E2E tests
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,playwright}.config.*'
    ],
  },
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
  },
  build: {
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Vendor chunks - libraries that rarely change
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
          'auth-vendor': ['@react-oauth/google'],
          'utils': ['js-sha256', 'dompurify'],

          // Split Radix UI components into their own chunk
          'radix-ui': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-dialog',
            '@radix-ui/react-label',
            '@radix-ui/react-select',
            '@radix-ui/react-slot'
          ],
        },
        // Better chunk naming for debugging
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
          return `assets/js/${chunkInfo.name || facadeModuleId}-[hash].js`;
        },
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name?.split('.').at(1) || 'asset';
          if (/css/i.test(extType)) {
            return `assets/css/[name]-[hash][extname]`;
          }
          if (/png|jpe?g|svg|gif|webp|ico/i.test(extType)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        }
      }
    },
    // Performance optimizations
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        passes: 2
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    },
    // Chunk size warnings
    chunkSizeWarningLimit: 500,
    // CSS code splitting
    cssCodeSplit: true,
    // Source maps only for errors in production
    sourcemap: 'hidden',
    // Better tree shaking
    treeShaking: true
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@react-oauth/google',
      'hoist-non-react-statics', // Force pre-bundling of CommonJS dependency
      'lucide-react'
    ],
    exclude: ['@sentry/react', '@anthropic-ai/sdk'],
    // Force Vite to handle CommonJS modules properly
    esbuildOptions: {
      // Ensure CommonJS modules are transformed to ESM
      mainFields: ['module', 'main'],
      platform: 'browser'
    }
  }
})