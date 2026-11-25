"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChromeAlertTriangle } from "@/components/brand/chrome-icons";
import { Button } from "@/components/ui/button";
import { SignInAgainButton } from "@/components/dashboard/SignInAgainButton";
import { customerErrorMessage } from "@/lib/client/customer-error-copy";
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
  if (parsed.status === 401) {
    return {
      title: "Your session has ended",
      message: `Sign in again to open this ${resourceLabel}.`,
    };
  }
  if (parsed.status === 403) {
    return {
      title: "No access",
      message: `You do not have access to this ${resourceLabel}. Ask your administrator to give you access, or go back and pick another.`,
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
    message: customerErrorMessage(parsed),
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
  const pathname = usePathname();
  const copy = error
    ? detailErrorFromResponse(error, resourceLabel)
    : {
        title: `${resourceLabel} unavailable`,
        message: fallbackMessage ?? "Please try again.",
      };
  const signedOut = error?.status === 401;
  // Retrying cannot fix a missing permission, so 403 offers only a way back.
  const canRetry = Boolean(onRetry) && error?.status !== 403;

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <ChromeAlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h2 className="mb-2 text-xl font-semibold">{copy.title}</h2>
        <p className="mb-2 text-muted-foreground">{copy.message}</p>
        {error?.eventId ? (
          <p className="mb-4 text-xs text-muted-foreground">
            Error ID: {error.eventId}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {signedOut ? (
            <SignInAgainButton callbackUrl={pathname ?? backHref} />
          ) : null}
          {canRetry ? (
            <Button
              type="button"
              variant={signedOut ? "outline" : "default"}
              size="touch"
              onClick={onRetry}
              className={
                signedOut
                  ? undefined
                  : "bg-brand-cta text-white hover:bg-brand-cta/90"
              }
            >
              Retry
            </Button>
          ) : null}
          <Button asChild variant="outline" size="touch">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
