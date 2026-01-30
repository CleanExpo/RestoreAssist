'use client'

import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import Link from 'next/link'

interface ErrorFallbackProps {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  showHomeLink?: boolean
  homeHref?: string
}

export function ErrorFallback({
  error,
  reset,
  title = 'Something went wrong',
  showHomeLink = false,
  homeHref = '/',
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
      <p className="text-gray-600 dark:text-slate-400 max-w-md mb-1">
        An unexpected error occurred. Please try again.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-6">
          Error ID: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Try Again
        </button>
        {showHomeLink && (
          <Link
            href={homeHref}
            className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-medium transition-colors"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
        )}
      </div>
    </div>
  )
}
