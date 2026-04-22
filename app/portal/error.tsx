"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { reportClientError } from "@/lib/observability";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PortalError]", error);
    // RA-1544 — ship to Vercel Observability sink.
    reportClientError(error, {
      boundary: "PortalError",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Portal Error"
        showHomeLink
        homeHref="/portal"
      />
    </div>
  );
}
