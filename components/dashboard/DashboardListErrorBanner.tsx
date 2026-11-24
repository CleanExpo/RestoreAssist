"use client";

import { Button } from "@/components/ui/button";
import { SignInAgainButton } from "@/components/dashboard/SignInAgainButton";
import { customerErrorMessage } from "@/lib/client/customer-error-copy";
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
  const parts = [
    `Could not load ${resourceLabel}.`,
    customerErrorMessage(error),
  ];
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
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {error.status === 401 ? <SignInAgainButton /> : null}
        {error.status === 403 ? null : (
          <Button type="button" variant="outline" size="touch" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
