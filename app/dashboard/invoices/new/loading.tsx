import { Skeleton } from "@/components/ui/skeleton"

export default function NewInvoiceLoading() {
  return (
    <div className="space-y-6 p-6 max-w-5xl">
      {/* Back link + title */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-8 w-40" />
      </div>
      {/* Client selector */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      {/* Line items */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-12 w-full rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      {/* Actions */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
    </div>
  )
}
