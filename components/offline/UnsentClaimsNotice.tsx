"use client";

/**
 * RA-7877 — after sign-out, tell the technician that claims captured offline
 * but not yet sent are still on this device. Signing out never discards them
 * (the founder rules out silent loss). Only queued claims send once the owner
 * signs in; refused or held ones are described as needing attention (RA-8641).
 * Shows counts only; no address, note or photo is read or displayed here.
 */
import { useEffect, useState } from "react";
import { countUnsentClaims } from "@/lib/offline/claim-capture-queue";
import { describeUnsentClaims, type ClaimStateCounts } from "@/lib/offline/unsent-claims-message";

export function UnsentClaimsNotice() {
  const [counts, setCounts] = useState<ClaimStateCounts | null>(null);
  useEffect(() => {
    let live = true;
    void countUnsentClaims().then((c) => {
      if (live) setCounts(c);
    });
    return () => {
      live = false;
    };
  }, []);
  const message = counts ? describeUnsentClaims(counts, "signed-out") : null;
  if (!message) return null;
  return (
    <p
      role="status"
      data-testid="unsent-claims-notice"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {message}
    </p>
  );
}
