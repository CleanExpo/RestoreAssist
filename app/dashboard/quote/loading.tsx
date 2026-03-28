import { Skeleton } from "@/components/ui/skeleton"

export default function QuoteLoading() {
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <Skeleton className="h-8 w-48" />
      {/* Job type selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {/* Form fields */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      {/* Quote results placeholder */}
      <Skeleton className="h-64 rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  )
}
