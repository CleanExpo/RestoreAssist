import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPanel } from "@/app/dashboard/components/DashboardPanel";

export default function MargotHomeLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <DashboardPanel key={i}>
            <Skeleton className="h-16 w-full" />
          </DashboardPanel>
        ))}
      </div>
      <DashboardPanel>
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="h-20 w-full" />
      </DashboardPanel>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <DashboardPanel key={i}>
            <Skeleton className="h-32 w-full" />
          </DashboardPanel>
        ))}
      </div>
    </div>
  );
}
