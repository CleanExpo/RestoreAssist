"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChromeCheck, ChromeCircle, ChromeMail, ChromeSpinner } from "@/components/brand/chrome-icons";
import {
  buildClientSendChecklist,
  type InspectionCommsReadiness,
} from "@/lib/dashboard/inspection-comms-readiness";
import { cn } from "@/lib/utils";

type Props = {
  inspectionId: string | null;
  reportId: string;
  reportStatus: string;
  /** When there is no inspection job, client email comes from the report record. */
  clientEmailHint?: string | null;
  onSend?: () => void;
  sending?: boolean;
  canSend: boolean;
};

export function ReportClientSendChecklist({
  inspectionId,
  reportId,
  reportStatus,
  onSend,
  sending,
  canSend,
}: Props) {
  const [readiness, setReadiness] = useState<InspectionCommsReadiness | null>(
    null,
  );
  const [loading, setLoading] = useState(Boolean(inspectionId));

  useEffect(() => {
    if (!inspectionId) {
      setReadiness({
        emailServiceConfigured: false,
        clientHasEmail: false,
        clientEmail: null,
        reportId,
        reportStatus,
        reportPdfReady: reportStatus === "COMPLETED",
        reportDeliveredAt: null,
        portalLinkEmailedAt: null,
        clientEmailSentAt: null,
        completenessBlockerCount: 0,
      });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/comms-readiness`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as { data: InspectionCommsReadiness };
        if (!cancelled) setReadiness(body.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId, reportId, reportStatus]);

  const merged: InspectionCommsReadiness =
    readiness ?? {
      emailServiceConfigured: false,
      clientHasEmail: false,
      clientEmail: null,
      reportId,
      reportStatus,
      reportPdfReady: reportStatus === "COMPLETED",
      reportDeliveredAt: null,
      portalLinkEmailedAt: null,
      clientEmailSentAt: null,
      completenessBlockerCount: 0,
    };

  const items = buildClientSendChecklist(merged);
  const allReady = items.every((i) => i.ok);

  return (
    <section
      aria-label="Send report to client"
      className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ChromeMail size={16} aria-hidden />
            Email the client
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Checklist before delivery — same rules Close Job uses for report
            sent.
          </p>
        </div>
        {onSend && (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || !allReady || sending}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              allReady && canSend
                ? "bg-cyan-600 text-white hover:bg-cyan-500"
                : "bg-slate-700 text-slate-400 cursor-not-allowed",
            )}
          >
            {sending ? (
              <ChromeSpinner size={16} className="animate-spin" />
            ) : (
              <ChromeMail size={16} />
            )}
            Send to client
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <ChromeSpinner size={14} className="animate-spin" />
          Checking email readiness…
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2 text-sm">
              {item.ok ? (
                <ChromeCheck
                  size={16}
                  className="text-emerald-400 shrink-0 mt-0.5"
                  aria-hidden
                />
              ) : (
                <ChromeCircle
                  size={16}
                  className="text-amber-400 shrink-0 mt-0.5"
                  aria-hidden
                />
              )}
              <div>
                <span className="text-slate-200">{item.label}</span>
                <p className="text-xs text-slate-400">{item.hint}</p>
                {!item.ok && item.href && (
                  <Link
                    href={item.href}
                    className="text-xs text-cyan-400 hover:underline"
                  >
                    Fix in settings or report →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {merged.clientEmailSentAt && (
        <p className="mt-3 text-xs text-emerald-400/90">
          Client was emailed{" "}
          {new Date(merged.clientEmailSentAt).toLocaleString("en-AU")}.
        </p>
      )}
    </section>
  );
}
