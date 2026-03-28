import { Skeleton } from "@/components/ui/skeleton"

export default function NewRestorationInvoiceLoading() {
  return (
    <div className="space-y-6 p-6 max-w-5xl">
      {/* Back link + title */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-8 w-48" />
      </div>
      {/* Invoice form sections */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="grid md:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="space-y-1.5">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Line items table */}
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-12 w-full rounded-lg" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
        {/* Sidebar summary */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <Skeleton className="h-6 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            <Skeleton className="h-px w-full" />
            <div className="flex justify-between">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
