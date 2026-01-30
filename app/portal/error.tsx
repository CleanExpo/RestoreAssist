'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ErrorFallback } from '@/components/ErrorFallback'

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[PortalError]', error)
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Portal Error"
        showHomeLink
        homeHref="/portal"
      />
    </div>
  )
}
