/**
 * Property Data Display Component
 * Stub component for displaying property data
 */

'use client'

import { cn } from '@/lib/utils'

interface PropertyDataDisplayProps {
  data: any
  fetchedAt?: string | null
  source?: string
  expiresAt?: string | null
}

export function PropertyDataDisplay({
  data,
  fetchedAt,
  source = 'CORELOGIC',
  expiresAt,
}: PropertyDataDisplayProps) {
  if (!data) return null

  return (
    <div className={cn(
      "rounded-lg p-4",
      "bg-neutral-50 dark:bg-neutral-800/50",
      "border border-neutral-200 dark:border-neutral-700"
    )}>
      <div className="space-y-2">
        <h4 className={cn(
          "text-sm font-semibold",
          "text-neutral-900 dark:text-neutral-100"
        )}>
          Property Data ({source})
        </h4>
        {data.yearBuilt && (
          <p className={cn("text-sm", "text-neutral-700 dark:text-neutral-300")}>
            Year Built: {data.yearBuilt}
          </p>
        )}
        {fetchedAt && (
          <p className={cn("text-xs", "text-neutral-500 dark:text-neutral-400")}>
            Fetched: {new Date(fetchedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
