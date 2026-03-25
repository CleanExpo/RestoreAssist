'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope)

        // Check for updates on page load
        reg.update()
      })
      .catch((err) => {
        console.error('[SW] Registration failed:', err)
      })
  }, [])

  return null
}
