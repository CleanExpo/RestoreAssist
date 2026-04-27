"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { reportClientError } from "@/lib/observability";

/**
 * RA-1549 — colocated error boundary for the inspection detail tree.
 * Any async failure inside /dashboard/inspections/[id]/** is caught
 * here instead of tunneling up to the generic /dashboard boundary so
 * the user stays on the inspection context and can retry.
 */
export default function InspectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[InspectionError]", error);
    reportClientError(error, {
      boundary: "InspectionError",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Inspection failed to load"
        showHomeLink
        homeHref="/dashboard/inspections"
      />
    </div>
  );
}
