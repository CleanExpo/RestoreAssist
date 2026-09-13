"use client";

/**
 * RA-7549 — post-signup CTA. Lands on the working Basic report path
 * (`/dashboard/reports/new`) without sending the stranger to a BYOK wall.
 */

import Link from "next/link";
import {
  BASIC_REPORT_CTA_LABEL,
  BASIC_REPORT_PATH,
  BASIC_WITHOUT_KEY_BODY,
  BASIC_WITHOUT_KEY_HEADLINE,
} from "@/lib/signup-pricing-honesty";

export function BasicReportWithoutKeyCta({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";

  return (
    <div
      data-testid="basic-report-without-key-cta"
      className={
        dark
          ? "mx-6 mt-4 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          : "rounded-2xl border border-cyan-200 bg-cyan-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
      }
    >
      <div className="min-w-0">
        <p
          className={
            dark
              ? "text-sm font-semibold text-cyan-100"
              : "text-sm font-semibold text-neutral-900"
          }
        >
          {BASIC_WITHOUT_KEY_HEADLINE}
        </p>
        <p
          className={
            dark
              ? "text-xs text-cyan-100/80 mt-0.5"
              : "text-xs text-neutral-600 mt-0.5"
          }
        >
          {BASIC_WITHOUT_KEY_BODY}
        </p>
      </div>
      <Link
        href={BASIC_REPORT_PATH}
        className={
          dark
            ? "flex-shrink-0 rounded px-3 py-1.5 text-sm font-medium border border-cyan-400/60 text-cyan-50 hover:bg-cyan-500/20 transition-colors"
            : "shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-700 text-white whitespace-nowrap"
        }
      >
        {BASIC_REPORT_CTA_LABEL}
      </Link>
    </div>
  );
}
