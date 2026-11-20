"use client";

import Link from "next/link";
import type { ParsedApiError } from "@/lib/client/parse-api-error";

type Props = {
  resourceLabel: string;
  error: ParsedApiError;
  onRetry: () => void;
};

export function dashboardListErrorSummary(
  error: ParsedApiError,
  resourceLabel: string,
): string {
  const parts = [`Could not load ${resourceLabel}.`];
  if (error.message && error.message !== "Something went wrong") {
    parts.push(error.message);
  } else if (error.status) {
    parts.push(`HTTP ${error.status}`);
  }
  if (error.code && error.code !== "UNKNOWN") {
    parts.push(`(${error.code})`);
  }
  if (error.eventId) {
    parts.push(`Error ID: ${error.eventId}`);
  }
  return parts.join(" ");
}

export function DashboardListErrorBanner({
  resourceLabel,
  error,
  onRetry,
}: Props) {
  const summary = dashboardListErrorSummary(error, resourceLabel);

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-800 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm">{summary}</span>
      <div className="flex flex-shrink-0 items-center gap-2">
        {error.status === 401 ? (
          <Link
            href="/login"
            className="rounded px-3 py-1 text-sm border border-red-500/40 hover:bg-red-500/20 transition-colors"
          >
            Sign in again
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="rounded px-3 py-1 text-sm border border-red-500/40 hover:bg-red-500/20 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
