import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from './lib/theme-provider'
import { initializeSentry } from './sentry'
import { ErrorBoundary } from './components/ErrorBoundary'

// Initialize Sentry for error tracking in production
initializeSentry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="restoreassist-ui-theme">
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
