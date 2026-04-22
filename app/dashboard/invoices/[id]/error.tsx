"use client";

import { useEffect } from "react";
import { ErrorFallback } from "@/components/ErrorFallback";
import { reportClientError } from "@/lib/observability";

export default function InvoiceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[InvoiceError]", error);
    reportClientError(error, { boundary: "InvoiceError", digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <ErrorFallback
        error={error}
        reset={reset}
        title="Invoice failed to load"
        showHomeLink
        homeHref="/dashboard/invoices"
      />
    </div>
  );
}
