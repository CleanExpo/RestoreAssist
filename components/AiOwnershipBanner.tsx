"use client";

import { useState } from "react";
import { ChromeCheck, ChromeCircle } from "@/components/brand/chrome-icons";
import {
  AI_OWNERSHIP_ACK_LABEL,
  AI_OWNERSHIP_EDIT_REQUIRED,
  AI_OWNERSHIP_EXPORT_READY,
  AI_OWNERSHIP_EXPORT_WATERMARKED,
  AI_OWNERSHIP_STEPPER_HEADING,
  AI_OWNERSHIP_STEPPER_SUBHEAD,
  canAcknowledgeAiOwnership,
  getAiOwnershipStatus,
  getAiOwnershipStatusMeta,
  getAiOwnershipSteps,
  isAiDraftPending,
  type AiOwnershipFields,
} from "@/lib/reports/ai-ownership";

interface AiOwnershipBannerProps {
  reportId: string;
  report: AiOwnershipFields;
  onAcknowledged: () => void;
  /** Optional: jump holder into rewrite mode. */
  onStartRewrite?: () => void;
}

/**
 * Enterprise ownership review panel — stepper + acknowledge CTA.
 * Styled for `.report-light-surface` (white document pane under global dark theme).
 */
export default function AiOwnershipBanner({
  reportId,
  report,
  onAcknowledged,
  onStartRewrite,
}: AiOwnershipBannerProps) {
  const [acking, setAcking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = getAiOwnershipStatus(report);
  const meta = getAiOwnershipStatusMeta(report);
  const steps = getAiOwnershipSteps(report);
  const canAck = canAcknowledgeAiOwnership(report);
  const pending = isAiDraftPending(report);

  if (status === "no_content") return null;

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

  if (status === "owned") {
    return (
      <section
        className="print:hidden mb-4 rounded-[10px] border border-emerald-300 bg-emerald-50 px-4 py-4"
        aria-label={AI_OWNERSHIP_STEPPER_HEADING}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <ChromeCheck className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-emerald-900">{meta.label}</p>
            <p className="text-sm text-slate-700">{AI_OWNERSHIP_EXPORT_READY}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!pending) return null;

  return (
    <section
      className="print:hidden mb-4 rounded-[10px] border border-amber-300 bg-amber-50 px-4 py-4 space-y-4"
      aria-label={AI_OWNERSHIP_STEPPER_HEADING}
    >
      <header className="space-y-1">
        <p className="font-semibold text-amber-950">{AI_OWNERSHIP_STEPPER_HEADING}</p>
        <p className="text-sm text-amber-950/85">{AI_OWNERSHIP_STEPPER_SUBHEAD}</p>
      </header>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const isComplete = step.state === "complete";
          const isCurrent = step.state === "current";
          return (
            <li
              key={step.id}
              className={
                "rounded-lg border px-3 py-3 " +
                (isCurrent
                  ? "border-amber-600 bg-white shadow-sm"
                  : isComplete
                    ? "border-emerald-300 bg-emerald-50/80"
                    : "border-slate-200 bg-white/60")
              }
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span
                  className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                    (isComplete
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-amber-600 text-white"
                        : "bg-slate-200 text-slate-700")
                  }
                  aria-hidden
                >
                  {isComplete ? <ChromeCheck className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="text-sm font-medium text-slate-900">{step.title}</span>
                {isCurrent && (
                  <ChromeCircle
                    className="ml-auto h-2.5 w-2.5 fill-amber-600 text-amber-600"
                    aria-label="Current step"
                  />
                )}
              </div>
              <p className="pl-8 text-xs text-slate-600">{step.description}</p>
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-amber-950/90">{AI_OWNERSHIP_EXPORT_WATERMARKED}</p>

      {status === "ai_draft" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-amber-950">{AI_OWNERSHIP_EDIT_REQUIRED}</p>
          {onStartRewrite && (
            <button
              type="button"
              onClick={onStartRewrite}
              className="min-h-[44px] rounded-[10px] border border-amber-700/35 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100/80"
            >
              Rewrite report in your own words
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canAck || acking}
        onClick={() => void handleAcknowledge()}
        className="min-h-[44px] w-full rounded-[10px] bg-amber-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {acking ? "Confirming…" : AI_OWNERSHIP_ACK_LABEL}
      </button>
    </section>
  );
}
