"use client";

/**
 * RA-7549 — post-signup CTA. Lands on the working Basic report path
 * (`/dashboard/reports/new`) without sending the stranger to a BYOK wall.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  BASIC_REPORT_CTA_LABEL,
  BASIC_REPORT_PATH,
  BASIC_WITHOUT_KEY_BODY,
  BASIC_WITHOUT_KEY_HEADLINE,
} from "@/lib/signup-pricing-honesty";

function ReportMark({ className }: { className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

export function BasicReportWithoutKeyCta({
  variant = "light",
  layout = "inline",
}: {
  variant?: "light" | "dark";
  /** `banner` = full-width horizontal promo (onboarding). `inline` = compact strip (dashboard). */
  layout?: "inline" | "banner";
}) {
  const isDark = variant === "dark";
  const isBanner = layout === "banner";

  const ctaClass = cn(
    "inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    isDark
      ? "bg-brand-gold text-brand-navy shadow-md shadow-black/20 hover:bg-brand-gold-hover"
      : "bg-brand-navy text-white shadow-md shadow-brand-navy/20 hover:bg-brand-navy-hover",
    isBanner ? "w-full sm:w-auto sm:min-w-[220px]" : "shrink-0 whitespace-nowrap",
  );

  const content = (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-1 gap-4",
          isBanner ? "items-start sm:items-center" : "items-center",
        )}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl ring-1",
            isBanner ? "h-12 w-12" : "h-10 w-10",
            isDark
              ? "bg-brand-gold/15 text-brand-gold ring-brand-gold/35"
              : "bg-brand-navy/5 text-brand-navy ring-brand-navy/10",
          )}
        >
          <ReportMark className={isBanner ? "h-6 w-6" : "h-5 w-5"} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "font-semibold leading-snug",
              isBanner ? "text-base sm:text-lg" : "text-sm",
              isDark ? "text-white" : "text-neutral-900",
            )}
          >
            {BASIC_WITHOUT_KEY_HEADLINE}
          </p>
          <p
            className={cn(
              "mt-1.5 leading-relaxed",
              isBanner ? "text-sm" : "text-xs",
              isDark ? "text-white/70" : "text-neutral-600",
              isBanner && "max-w-3xl",
            )}
          >
            {BASIC_WITHOUT_KEY_BODY}
          </p>
        </div>
      </div>
      <Link href={BASIC_REPORT_PATH} className={ctaClass}>
        {BASIC_REPORT_CTA_LABEL}
      </Link>
    </>
  );

  return (
    <div
      data-testid="basic-report-without-key-cta"
      className={cn(
        isBanner
          ? "grid gap-5 rounded-2xl border p-6 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-8 lg:p-8"
          : "flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3",
        isDark
          ? isBanner
            ? "border-brand-gold/25 bg-linear-to-br from-brand-surface via-brand-surface-2 to-brand-deep shadow-lg shadow-black/25"
            : "mx-6 mt-4 border-brand-gold/30 bg-brand-surface/80"
          : isBanner
            ? "border-brand-navy/10 bg-white shadow-sm"
            : "border-neutral-200 bg-white",
      )}
    >
      {isBanner ? content : (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
          {content}
        </div>
      )}
    </div>
  );
}
