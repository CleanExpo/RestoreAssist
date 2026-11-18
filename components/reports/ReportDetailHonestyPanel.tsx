"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChromeAlertTriangle,
  ChromeCheckCircle,
} from "@/components/brand/chrome-icons";
import {
  getAiOwnershipStatusMeta,
  type AiOwnershipFields,
} from "@/lib/reports/ai-ownership";
import {
  REPORT_DETAIL_AI_DRAFT_BODY,
  REPORT_DETAIL_AI_DRAFT_VS_ISSUED_TITLE,
  REPORT_DETAIL_ISSUED_BODY,
  REPORT_DETAIL_UPLOAD_PDF_BODY,
  REPORT_DETAIL_UPLOAD_PDF_HEADING,
} from "@/lib/reports/report-detail-honesty-copy";
import {
  UPLOAD_PDF_TRIAL_BODY,
  UPLOAD_PDF_TRIAL_TITLE,
} from "@/lib/reports/upload-pdf-copy";

type ReportHonestyReport = AiOwnershipFields & {
  status?: string | null;
};

type Props = {
  report: ReportHonestyReport;
};

/**
 * RA-7550 — report detail honesty: AI draft vs issued report, Upload PDF pointer.
 */
export function ReportDetailHonestyPanel({ report }: Props) {
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/user/profile");
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const status =
          data?.profile?.subscriptionStatus || data?.subscriptionStatus;
        if (status && !cancelled) setSubscriptionStatus(status);
      } catch {
        // Optional — panel still shows draft vs issued without plan info.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ownership = getAiOwnershipStatusMeta(report);
  const isCompleted = report.status === "COMPLETED";
  const showIssued =
    isCompleted &&
    (ownership.status === "owned" || ownership.status === "ready_to_acknowledge");

  return (
    <section
      data-testid="report-detail-honesty-panel"
      className="print:hidden space-y-3"
      aria-label={REPORT_DETAIL_AI_DRAFT_VS_ISSUED_TITLE}
    >
      <div
        className={`rounded-[10px] border px-4 py-4 space-y-2 ${
          showIssued
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-warning/50 bg-warning/10"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${
              showIssued ? "bg-emerald-700" : "bg-amber-700"
            }`}
          >
            {showIssued ? (
              <ChromeCheckCircle className="h-4 w-4" aria-hidden />
            ) : (
              <ChromeAlertTriangle className="h-4 w-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-slate-100">
              {REPORT_DETAIL_AI_DRAFT_VS_ISSUED_TITLE}
            </p>
            <p className="text-sm text-slate-300">
              {showIssued ? REPORT_DETAIL_ISSUED_BODY : REPORT_DETAIL_AI_DRAFT_BODY}
            </p>
            <p className="text-sm font-medium text-slate-200">
              Status:{" "}
              <span data-testid="report-honesty-ownership-label">
                {ownership.shortLabel}
              </span>
              {isCompleted ? " · Report complete" : " · In progress"}
            </p>
          </div>
        </div>
      </div>

      <div
        data-testid="report-detail-upload-pdf-hint"
        className="rounded-[10px] border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300"
      >
        <p className="font-medium text-slate-100">
          {REPORT_DETAIL_UPLOAD_PDF_HEADING}
        </p>
        {subscriptionStatus === "TRIAL" ? (
          <>
            <p className="mt-1">{UPLOAD_PDF_TRIAL_TITLE}</p>
            <p className="mt-1 text-slate-400">{UPLOAD_PDF_TRIAL_BODY}</p>
          </>
        ) : (
          <p className="mt-1">
            {REPORT_DETAIL_UPLOAD_PDF_BODY}{" "}
            <Link
              href="/dashboard/reports/new"
              className="text-cyan-400 hover:text-cyan-300 underline"
            >
              Create report → Upload PDF
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
