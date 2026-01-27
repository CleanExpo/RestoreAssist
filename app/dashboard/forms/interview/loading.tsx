import { Skeleton } from "@/components/ui/skeleton"

export default function InterviewFormLoading() {
  return (
    <div className="space-y-6 p-6 max-w-2xl">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-4 border border-gray-200 dark:border-slate-700 rounded-xl p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  )
}
