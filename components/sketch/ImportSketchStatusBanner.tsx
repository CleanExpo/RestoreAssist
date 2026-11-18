"use client";

/**
 * RA-8232 — persistent reminder after backup-reader import until dismissed.
 */

import { useState } from "react";
import { RAIcon } from "@/components/brand/RAIcon";

export type ImportSketchBannerProps = {
  roomCount: number;
  vendor: "anthropic" | "abliteration";
  primaryFailureDetail?: string;
};

export function ImportSketchStatusBanner({
  roomCount,
  vendor,
  primaryFailureDetail,
}: ImportSketchBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const headline =
    vendor === "abliteration"
      ? "Rooms from backup reader — measure on site before billing"
      : "AI-suggested rooms — measure on site before billing";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
      data-testid="import-sketch-status-banner"
    >
      <RAIcon name="warning" size={16} decorative className="mt-0.5 shrink-0" />
      <div className="flex-1 space-y-0.5">
        <p className="font-medium">{headline}</p>
        <p className="text-amber-100/80">
          {roomCount} room{roomCount === 1 ? "" : "s"} added. Confirm each with
          on-site dimensions before they count toward scope.
        </p>
        {primaryFailureDetail && (
          <p className="text-[10px] text-amber-100/60">
            Primary reader note: {primaryFailureDetail}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 text-amber-100/80 hover:bg-amber-500/20"
        aria-label="Dismiss import reminder"
      >
        Dismiss
      </button>
    </div>
  );
}
