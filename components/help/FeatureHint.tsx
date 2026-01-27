'use client'

import { useState, useEffect } from 'react'
import { X, Lightbulb, Info, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeatureHintProps {
  id: string // Unique ID for localStorage persistence
  title?: string
  message: string
  variant?: 'tip' | 'info' | 'warning'
  dismissible?: boolean
  className?: string
}

/**
 * Feature hint component for contextual guidance
 * Appears once per feature and can be dismissed permanently
 */
export function FeatureHint({
  id,
  title,
  message,
  variant = 'tip',
  dismissible = true,
  className,
}: FeatureHintProps) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    // Check if hint was previously dismissed
    const isDismissed = localStorage.getItem(`hint-dismissed-${id}`)
    setDismissed(!!isDismissed)
  }, [id])

  const handleDismiss = () => {
    localStorage.setItem(`hint-dismissed-${id}`, 'true')
    setDismissed(true)
  }

  if (dismissed) return null

  const icons = {
    tip: Lightbulb,
    info: Info,
    warning: AlertCircle,
  }

  const styles = {
    tip: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
    info: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400',
    warning: 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400',
  }

  const Icon = icons[variant]

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border',
        styles[variant],
        className
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium text-sm mb-1">{title}</p>}
        <p className="text-sm opacity-90">{message}</p>
      </div>
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label="Dismiss hint"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
