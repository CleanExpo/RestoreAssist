"use client";

import { Button } from "@/components/ui/button";
import { SignInAgainButton } from "@/components/dashboard/SignInAgainButton";
import { customerErrorMessage } from "@/lib/client/customer-error-copy";
import type { ParsedApiError } from "@/lib/client/parse-api-error";

export type DashboardLoadFailure = {
  label: string;
  error: ParsedApiError | null;
  loading: boolean;
  retry: () => void;
};

/** Per-section load failures on the dashboard overview. Display only. */
export function DashboardLoadFailureList({
  failures,
}: {
  failures: DashboardLoadFailure[];
}) {
  return (
    <div
      role="alert"
      className="mt-4 space-y-2 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-300"
    >
      <p>Some workspace data could not be loaded. Available sections are shown below.</p>
      <ul className="space-y-2">
        {failures.map(({ label, error, loading, retry }) => (
          <li
            key={label}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              {label}: {customerErrorMessage(error ?? { status: 0, message: "" })}
              {error?.eventId ? ` Error ID: ${error.eventId}` : ""}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">
              {error?.status === 401 ? <SignInAgainButton /> : null}
              {error?.status === 403 ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={retry}
                  disabled={loading}
                >
                  Retry {label.toLowerCase()}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
