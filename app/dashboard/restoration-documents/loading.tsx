import { Skeleton } from "@/components/ui/skeleton"

export default function RestorationDocumentsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
      {/* Filter tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      {/* Document list */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-16 w-full border-t border-gray-100 dark:border-slate-800 bg-muted/50 animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
