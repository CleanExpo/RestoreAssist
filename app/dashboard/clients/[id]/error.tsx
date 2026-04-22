"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { reportClientError } from "@/lib/observability";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ClientError]", error);
    reportClientError(error, { boundary: "ClientError", digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Client record failed to load"
        showHomeLink
        homeHref="/dashboard/clients"
      />
    </div>
  );
}
