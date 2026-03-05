import { Skeleton } from "@/components/ui/skeleton"

export default function IntegrationsLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-5 w-72" />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
