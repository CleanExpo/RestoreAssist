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
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-6 text-slate-100 shadow-lg shadow-black/30">
        <ErrorFallback
          error={error}
          reset={reset}
          title="Portal error"
          showHomeLink
          homeHref="/portal/login"
        />
      </div>
    </div>
  );
}
