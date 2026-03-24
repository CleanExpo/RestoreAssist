'use client'

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ErrorFallback'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[DashboardError]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Dashboard Error"
        showHomeLink
        homeHref="/dashboard"
      />
    </div>
  )
}
