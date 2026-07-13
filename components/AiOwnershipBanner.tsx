"use client";

import { useState } from "react";
import {
  AI_OWNERSHIP_ACK_LABEL,
  AI_OWNERSHIP_BANNER_BODY,
  AI_OWNERSHIP_BANNER_TITLE,
  AI_OWNERSHIP_EDIT_REQUIRED,
  canAcknowledgeAiOwnership,
  isAiDraftPending,
  type AiOwnershipFields,
} from "@/lib/reports/ai-ownership";

interface AiOwnershipBannerProps {
  reportId: string;
  report: AiOwnershipFields;
  onAcknowledged: () => void;
}

export default function AiOwnershipBanner({
  reportId,
  report,
  onAcknowledged,
}: AiOwnershipBannerProps) {
  const [acking, setAcking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAiDraftPending(report)) return null;

  const canAck = canAcknowledgeAiOwnership(report);

  const handleAcknowledge = async () => {
    setAcking(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/acknowledge-ownership`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body.error === "string"
            ? body.error
            : AI_OWNERSHIP_EDIT_REQUIRED,
        );
        return;
      }
      onAcknowledged();
    } catch {
      setError("Failed to acknowledge ownership");
    } finally {
      setAcking(false);
    }
  };

  return (
    <div className="print:hidden mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 space-y-3">
      <div>
        <p className="font-semibold text-amber-800 dark:text-amber-200">
          {AI_OWNERSHIP_BANNER_TITLE}
        </p>
        <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1">
          {AI_OWNERSHIP_BANNER_BODY}
        </p>
      </div>
      {!canAck && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {AI_OWNERSHIP_EDIT_REQUIRED}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        disabled={!canAck || acking}
        onClick={() => void handleAcknowledge()}
        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
      >
        {acking ? "Saving…" : AI_OWNERSHIP_ACK_LABEL}
      </button>
    </div>
  );
}
