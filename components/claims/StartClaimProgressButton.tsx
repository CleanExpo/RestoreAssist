"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Play } from "lucide-react";

/**
 * Bootstraps ClaimProgress for a report so it appears on the Claims CRM board.
 */
export function StartClaimProgressButton({
  reportId,
  inspectionId,
  className,
}: {
  reportId: string;
  inspectionId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/progress/${reportId}/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `claim-init-${reportId}-${Date.now()}`,
        },
        body: JSON.stringify(
          inspectionId ? { inspectionId } : {},
        ),
      });
      if (res.status === 409) {
        toast.success("Claim progress already started");
        router.push(`/dashboard/claims/${reportId}`);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        toast.error(data?.message ?? data?.error ?? "Could not start claim");
        return;
      }
      toast.success("Claim progress started");
      router.push(`/dashboard/claims/${reportId}`);
    } catch {
      toast.error("Network error starting claim");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-foreground text-background disabled:opacity-50"
      }
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      Start claim progress
    </button>
  );
}
