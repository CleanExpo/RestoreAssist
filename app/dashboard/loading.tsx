import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-[10px] lg:h-28" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-56 rounded-lg lg:col-span-3" />
        <Skeleton className="h-56 rounded-lg lg:col-span-2" />
      </div>
    </div>
  );
}
