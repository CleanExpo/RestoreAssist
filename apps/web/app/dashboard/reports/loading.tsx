import { Skeleton } from "@/components/ui/skeleton"

export default function ReportsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      {/* Filter toolbar */}
      <div className="grid md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full border-t border-gray-100 dark:border-slate-800" />
        ))}
      </div>
      {/* Pagination */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>
    </div>
  )
}
