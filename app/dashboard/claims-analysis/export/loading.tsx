import { Skeleton } from "@/components/ui/skeleton";

export default function ClaimsAnalysisExportLoading() {
  return (
    <div className="space-y-6 w-full">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="rounded-lg border border-border overflow-hidden">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-14 w-full rounded-none border-t border-border"
          />
        ))}
      </div>
    </div>
  );
}
