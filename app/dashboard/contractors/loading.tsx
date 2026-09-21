import { Skeleton } from "@/components/ui/skeleton";

export default function ContractorsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
