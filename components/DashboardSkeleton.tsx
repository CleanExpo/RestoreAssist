import { Skeleton } from '@/components/ui/skeleton'

/**
 * PageSkeleton — full page skeleton with header + content blocks.
 * Suitable as a <Suspense> fallback for most dashboard pages.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      {/* Stat cards */}
      <StatsSkeleton />
      {/* Content blocks */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-6 w-32" />
          <TableSkeleton rows={5} />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * CardSkeleton — single card-shaped skeleton block.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-muted/50 p-4 space-y-3 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

/**
 * TableSkeleton — table skeleton with n placeholder rows.
 */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      {/* Header row */}
      <Skeleton className="h-12 w-full rounded-none" />
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 w-full border-t border-gray-100 dark:border-slate-800 bg-muted/50 animate-pulse"
        />
      ))}
    </div>
  )
}

/**
 * StatsSkeleton — stats grid skeleton (4 cards in a responsive grid).
 */
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-muted/50 p-4 space-y-2 bg-muted/50 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}
