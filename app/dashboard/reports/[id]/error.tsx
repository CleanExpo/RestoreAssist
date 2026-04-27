"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { reportClientError } from "@/lib/observability";

export default function ReportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ReportError]", error);
    reportClientError(error, { boundary: "ReportError", digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Report failed to load"
        showHomeLink
        homeHref="/dashboard/reports"
      />
    </div>
  );
}
