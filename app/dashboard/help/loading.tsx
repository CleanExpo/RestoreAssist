import { Skeleton } from "@/components/ui/skeleton";
import { dashboardSurfaceClass } from "@/app/dashboard/components/DashboardPanel";
import { cn } from "@/lib/utils";

export default function HelpLoading() {
  return (
    <div className="w-full space-y-8 px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn("rounded-lg p-5 space-y-3", dashboardSurfaceClass)}
          >
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={cn("rounded-xl p-4 space-y-3", dashboardSurfaceClass)}
          >
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
