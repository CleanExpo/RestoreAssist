"use client";

/**
 * Workstream B — holder-facing handover package card.
 *
 * CLOSED jobs can complete handover (ZIP to BYOK storage). Once handed over,
 * the card re-signs a download URL on demand via GET.
 */
import { useState } from "react";
import {
  ChromeDownload,
  ChromeCheckCircle,
  ChromeAlertCircle,
} from "@/components/brand/chrome-icons";
import { RAIcon } from "@/components/brand/RAIcon";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";

interface HandoverPackagePanelProps {
  inspectionId: string;
  inspectionNumber: string;
  status: string;
  handoverCompletedAt?: string | null;
  handoverPackageStorageKey?: string | null;
  onHandedOver?: () => void;
}

export default function HandoverPackagePanel({
  inspectionId,
  inspectionNumber,
  status,
  handoverCompletedAt,
  handoverPackageStorageKey,
  onHandedOver,
}: HandoverPackagePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packageUrl, setPackageUrl] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState(handoverCompletedAt ?? null);

  const isClosed = status === "CLOSED";
  const alreadyDone = Boolean(completedAt || handoverPackageStorageKey);

  if (!isClosed && !alreadyDone) return null;

  async function completeHandover() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = Array.isArray(body?.error?.missing)
          ? body.error.missing.join(", ")
          : null;
        setError(
          body?.error?.message ||
            (missing ? `Cannot hand over: ${missing}` : "Handover failed"),
        );
        return;
      }
      setPackageUrl(body?.data?.packageUrl ?? null);
      setCompletedAt(
        body?.data?.handoverCompletedAt ?? new Date().toISOString(),
      );
      onHandedOver?.();
    } catch {
      setError("Handover failed — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDownload() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/handover`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body?.error?.message || "Could not refresh the download link",
        );
        return;
      }
      const url = body?.data?.packageUrl ?? null;
      if (!url) {
        setError("Download link unavailable — try again shortly");
        return;
      }
      setPackageUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not refresh the download link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Client handover package"
      className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/20 p-4"
    >
      <div className="flex items-start gap-3">
        <RAIcon
          name="job"
          decorative
          className="h-5 w-5 mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              Client handover package
            </p>
            {alreadyDone ? (
              <StatusBadge tone="success">Handed over</StatusBadge>
            ) : (
              <StatusBadge tone="info">Ready to hand over</StatusBadge>
            )}
          </div>

          <p className="text-sm text-emerald-900/80 dark:text-emerald-200/80">
            {alreadyDone
              ? `Inspection ${inspectionNumber} was handed over${
                  completedAt
                    ? ` on ${new Date(completedAt).toLocaleString("en-AU", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}`
                    : ""
                }. Download the ZIP for the client pack.`
              : `Build and store the client handover ZIP for ${inspectionNumber}. This records handover and returns a download link.`}
          </p>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <ChromeAlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {alreadyDone ? (
              <>
                {packageUrl ? (
                  <Button asChild size="sm" variant="default">
                    <a
                      href={packageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ChromeDownload className="h-4 w-4 mr-1.5" aria-hidden />
                      Download package
                    </a>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={packageUrl ? "outline" : "default"}
                  disabled={busy}
                  onClick={() => void refreshDownload()}
                >
                  {busy ? (
                    <Spinner className="h-4 w-4 mr-1.5" aria-hidden />
                  ) : (
                    <ChromeDownload className="h-4 w-4 mr-1.5" aria-hidden />
                  )}
                  {packageUrl ? "Refresh link" : "Get download link"}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void completeHandover()}
              >
                {busy ? (
                  <Spinner className="h-4 w-4 mr-1.5" aria-hidden />
                ) : (
                  <ChromeCheckCircle className="h-4 w-4 mr-1.5" aria-hidden />
                )}
                Complete handover
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
