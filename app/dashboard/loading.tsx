import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-w-0">
      <div className="-mx-3 h-48 bg-brand-navy sm:-mx-4 lg:-mx-6" />
      <div className="mt-8 flex gap-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1 rounded-none" />
        ))}
      </div>
      <div className="mt-10 space-y-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-none" />
        ))}
      </div>
    </div>
  );
}
