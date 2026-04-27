"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { reportClientError } from "@/lib/observability";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RootError]", error);
    // RA-1349 — also ship to the server-side sink so Vercel Observability
    // sees it. The digest is Next.js's server-side error correlation id.
    reportClientError(error, { boundary: "RootError", digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Application Error"
        showHomeLink
        homeHref="/"
      />
    </div>
  );
}
