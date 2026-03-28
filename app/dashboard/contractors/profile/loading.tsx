import { Skeleton } from "@/components/ui/skeleton"

export default function ContractorProfileLoading() {
  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      {/* Profile sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        </div>
      ))}
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  )
}
