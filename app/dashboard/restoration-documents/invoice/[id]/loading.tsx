import { Skeleton } from "@/components/ui/skeleton"

export default function RestorationInvoiceDetailLoading() {
  return (
    <div className="space-y-6 p-6 max-w-5xl">
      {/* Back link + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>
      {/* Invoice content */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-8 space-y-6">
        {/* Company + invoice info header */}
        <div className="flex justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="h-8 w-32 ml-auto" />
            <Skeleton className="h-4 w-40 ml-auto" />
            <Skeleton className="h-4 w-28 ml-auto" />
          </div>
        </div>
        {/* Line items */}
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-t-lg" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
          <Skeleton className="h-14 w-full rounded-b-lg" />
        </div>
        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
