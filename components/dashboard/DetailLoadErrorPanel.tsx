"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ParsedApiError } from "@/lib/client/parse-api-error";

type Props = {
  resourceLabel: string;
  error: ParsedApiError | null;
  fallbackMessage?: string;
  backHref: string;
  backLabel: string;
  onRetry?: () => void;
};

export function detailErrorFromResponse(
  parsed: ParsedApiError,
  resourceLabel: string,
): { title: string; message: string } {
  if (parsed.status === 401 || parsed.status === 403) {
    return {
      title: "Sign in required",
      message: `Your session may have expired. Sign in again to open this ${resourceLabel}.`,
    };
  }
  if (parsed.status === 404) {
    return {
      title: `${resourceLabel} not found`,
      message: `We could not find this ${resourceLabel}. It may have been deleted or you may not have access.`,
    };
  }
  return {
    title: `Could not load ${resourceLabel}`,
    message:
      parsed.message ||
      `Something went wrong (HTTP ${parsed.status || "unknown"}).`,
  };
}

export function DetailLoadErrorPanel({
  resourceLabel,
  error,
  fallbackMessage,
  backHref,
  backLabel,
  onRetry,
}: Props) {
  const copy = error
    ? detailErrorFromResponse(error, resourceLabel)
    : {
        title: `${resourceLabel} unavailable`,
        message: fallbackMessage ?? "Please try again.",
      };

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h2 className="mb-2 text-xl font-semibold">{copy.title}</h2>
        <p className="mb-2 text-muted-foreground">{copy.message}</p>
        {error?.eventId ? (
          <p className="mb-4 text-xs text-muted-foreground">
            Error ID: {error.eventId}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700"
            >
              Retry
            </button>
          ) : null}
          {error?.status === 401 ? (
            <Link
              href="/login"
              className="rounded-lg border border-border px-4 py-2 hover:bg-muted"
            >
              Sign in
            </Link>
          ) : null}
          <Link
            href={backHref}
            className="rounded-lg border border-border px-4 py-2 hover:bg-muted"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
