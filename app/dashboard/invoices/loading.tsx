import { Skeleton } from "@/components/ui/skeleton"

export default function InvoicesLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
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
