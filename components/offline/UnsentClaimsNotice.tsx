"use client";

/**
 * RA-7877 — after sign-out, tell the technician that claims captured offline
 * but not yet sent are still on this device. Signing out never discards them
 * (the founder rules out silent loss), and they send once the owner signs in.
 * Shows a count only; no address, note or photo is read or displayed here.
 */
import { useEffect, useState } from "react";
import { countUnsentClaims } from "@/lib/offline/claim-capture-queue";

export function unsentClaimsMessage(count: number): string | null {
  if (count <= 0) return null;
  return `You have ${count} claim${count === 1 ? "" : "s"} not yet sent. They stay on this device until you sign in and send them.`;
}

export function UnsentClaimsNotice() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    void countUnsentClaims().then((n) => {
      if (live) setCount(n);
    });
    return () => {
      live = false;
    };
  }, []);
  const message = unsentClaimsMessage(count);
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
