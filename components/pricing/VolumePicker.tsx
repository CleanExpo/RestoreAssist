"use client";

import { useId, useMemo, useState } from "react";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RAIcon } from "@/components/brand/RAIcon";
import { cn } from "@/lib/utils";
import { FONT_DISPLAY, SURFACE } from "@/components/landing/home/motion";
import {
  formatPerReport,
  perReportRate,
  planForVolume,
} from "@/lib/pricing/unit-rate";

/**
 * Volume picker for the public pricing page.
 *
 * The contractor sets the reports they write in a month and immediately sees
 * the plan, the packs added on top, the monthly total, and — the number this
 * page exists to make legible — the effective rate per report.
 *
 * All pricing arithmetic comes from `@/lib/pricing/unit-rate`. This component
 * only formats and lays out what the quote returns; it must never recompute a
 * total, a pack split, or a rate of its own.
 */

const MIN_REPORTS = 1;
const MAX_REPORTS = 500;
/** Reports per tap on the stepper. Exact figures go in the field directly. */
const STEP = 5;
const PRESETS = [50, 80, 120, 200] as const;

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const MONTHLY = PRICING_CONFIG.pricing.monthly;

/**
 * The rate card behind the recommendation — every purchasable block priced per
 * report, so the contractor can see for themselves why a bigger pack wins.
 */
const RATE_LADDER = [
  {
    key: "plan",
    label: MONTHLY.displayName,
    detail: `${MONTHLY.reportLimit} reports for ${AUD.format(MONTHLY.amount)}`,
    rate: perReportRate(MONTHLY.amount, MONTHLY.reportLimit),
  },
  ...Object.entries(PRICING_CONFIG.addons).map(([key, addon]) => ({
    key,
    label: addon.displayName,
    detail: `${addon.reportLimit} reports for ${AUD.format(addon.amount)}`,
    rate: perReportRate(addon.amount, addon.reportLimit),
  })),
];

function clampReports(value: number): number {
  if (!Number.isFinite(value)) return MIN_REPORTS;
  return Math.min(MAX_REPORTS, Math.max(MIN_REPORTS, Math.round(value)));
}

export interface VolumePickerProps {
  /** Reports per month the picker opens on. Defaults to the plan allowance. */
  initialReports?: number;
  className?: string;
}

export function VolumePicker({
  initialReports = MONTHLY.reportLimit,
  className,
}: VolumePickerProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  // The field keeps its own raw string so a contractor can clear it and type a
  // fresh figure; the quote always runs off the clamped number.
  const [raw, setRaw] = useState(() => String(clampReports(initialReports)));
  const reports = clampReports(Number.parseInt(raw, 10));

  const quote = useMemo(() => planForVolume(reports), [reports]);

  const overshoot = quote.reportsProvided - quote.reportsPerMonth;
  const effectiveRate = formatPerReport(quote.effectiveRate);

  const setReports = (next: number) => setRaw(String(clampReports(next)));

  return (
    <section
      className={cn(SURFACE, "p-6 sm:p-8", className)}
      aria-labelledby={`${fieldId}-heading`}
    >
      <h3
        id={`${fieldId}-heading`}
        className={cn(
          FONT_DISPLAY,
          "text-2xl font-semibold tracking-tight text-[#0B1F3A] sm:text-3xl",
        )}
      >
        What will your month cost?
      </h3>
      <p className="mt-3 max-w-[38rem] text-[15px] leading-relaxed text-slate-600">
        Set the number of inspection reports you write in a typical month. We
        will work out the plan, the report packs on top, and what each report
        actually costs you.
      </p>

      {/* ── Control ─────────────────────────────────────────────────────── */}
      <div className="mt-8">
        <label
          htmlFor={fieldId}
          className="block text-sm font-semibold text-[#0B1F3A]"
        >
          Reports per month
        </label>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setReports(reports - STEP)}
            disabled={reports <= MIN_REPORTS}
            aria-label={`Fewer reports, decrease by ${STEP}`}
            aria-controls={fieldId}
            className={cn(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              "border border-slate-300/90 bg-white text-2xl font-semibold text-[#0B1F3A]",
              "transition-colors duration-150 ease-out hover:border-slate-400 hover:bg-[#F3F5F7]",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
              FOCUS,
            )}
          >
            <span aria-hidden="true">&minus;</span>
          </button>

          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={MIN_REPORTS}
            max={MAX_REPORTS}
            step={1}
            value={raw}
            aria-describedby={hintId}
            onChange={(event) => setRaw(event.target.value)}
            onBlur={() => setRaw(String(reports))}
            className={cn(
              FONT_DISPLAY,
              "h-12 w-28 rounded-xl border border-slate-300/90 bg-white text-center",
              "text-2xl font-semibold tracking-tight text-[#0B1F3A]",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              FOCUS,
            )}
          />

          <button
            type="button"
            onClick={() => setReports(reports + STEP)}
            disabled={reports >= MAX_REPORTS}
            aria-label={`More reports, increase by ${STEP}`}
            aria-controls={fieldId}
            className={cn(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              "border border-slate-300/90 bg-white text-2xl font-semibold text-[#0B1F3A]",
              "transition-colors duration-150 ease-out hover:border-slate-400 hover:bg-[#F3F5F7]",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white",
              FOCUS,
            )}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>

        <p id={hintId} className="mt-2 text-xs text-slate-500">
          Anything from {MIN_REPORTS} to {MAX_REPORTS} reports a month. Type an
          exact figure, or step in {STEP}s.
        </p>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
            Common volumes
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = reports === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReports(preset)}
                  aria-pressed={active}
                  className={cn(
                    "min-h-11 rounded-xl px-4 text-sm font-semibold tracking-tight transition-colors duration-150 ease-out",
                    active
                      ? "bg-[#0B1F3A] text-white"
                      : "border border-slate-300/90 bg-white text-[#0B1F3A] hover:border-slate-400 hover:bg-[#F3F5F7]",
                    FOCUS,
                  )}
                >
                  {preset} a month
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Result ──────────────────────────────────────────────────────── */}
      <div className="mt-8 rounded-2xl bg-[#F3F5F7] p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
              Cost per report
            </p>
            <p
              className={cn(
                FONT_DISPLAY,
                "mt-2 text-4xl font-semibold tracking-tight text-[#0B1F3A] sm:text-5xl",
              )}
            >
              {effectiveRate}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              on each of the {quote.reportsPerMonth} reports you write.
            </p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
              Total each month
            </p>
            <p
              className={cn(
                FONT_DISPLAY,
                "mt-2 text-4xl font-semibold tracking-tight text-[#0B1F3A] sm:text-5xl",
              )}
            >
              {AUD.format(quote.totalAud)}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              AUD, incl. GST. Cancel any time.
            </p>
          </div>
        </div>

        {/* Line items */}
        <ul className="mt-6 space-y-2 border-t border-slate-200/90 pt-5 text-sm">
          <li className="flex items-start justify-between gap-4 text-slate-600">
            <span className="flex items-start gap-2">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="report" size={16} decorative />
              </span>
              <span>
                {MONTHLY.displayName} plan &mdash; {quote.baseIncluded} reports
                included
              </span>
            </span>
            <span className="shrink-0 font-semibold text-[#0B1F3A]">
              {AUD.format(MONTHLY.amount)}
            </span>
          </li>

          {quote.packs.map((purchase) => {
            const addon = PRICING_CONFIG.addons[purchase.pack];
            return (
              <li
                key={purchase.pack}
                className="flex items-start justify-between gap-4 text-slate-600"
              >
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#3B6D8C]">
                    <RAIcon name="task" size={16} decorative />
                  </span>
                  <span>
                    {purchase.qty} &times; {addon.displayName} &mdash;{" "}
                    {addon.reportLimit} reports at {AUD.format(addon.amount)}{" "}
                    each
                  </span>
                </span>
              </li>
            );
          })}

          {quote.packs.length > 0 ? (
            <li className="flex items-start justify-between gap-4 text-slate-600">
              <span className="pl-6">
                Report packs to cover the {quote.overage} over your plan
                allowance
              </span>
              <span className="shrink-0 font-semibold text-[#0B1F3A]">
                {AUD.format(quote.packsTotalAud)}
              </span>
            </li>
          ) : (
            <li className="flex items-start gap-2 text-slate-600">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="success" size={16} decorative />
              </span>
              <span>
                No packs needed &mdash; {reports} reports fits inside your plan
                allowance.
              </span>
            </li>
          )}
        </ul>

        {/* Honest overshoot disclosure */}
        {overshoot > 0 ? (
          <div className="mt-5 rounded-xl border border-[#3B6D8C]/25 bg-white p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-[#0B1F3A]">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="moisture" size={16} decorative />
              </span>
              <span>
                {quote.reportsProvided} reports available &mdash; {overshoot}{" "}
                more than the {quote.reportsPerMonth} you asked for.
              </span>
            </p>
            <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600">
              Bigger packs cost less per report, so buying up is cheaper than a
              smaller pack that only just covers you. The rate above is worked
              out over the {quote.reportsPerMonth} reports you actually write,
              so the spare ones are not flattering the figure.
            </p>
          </div>
        ) : null}
      </div>

      {/* Screen-reader summary of the live result. */}
      <p role="status" aria-live="polite" className="sr-only">
        At {quote.reportsPerMonth} reports a month:{" "}
        {AUD.format(quote.totalAud)} per month, {effectiveRate} per report.{" "}
        {quote.reportsProvided} reports available.
      </p>

      {/* ── Rate ladder ─────────────────────────────────────────────────── */}
      <div className="mt-8 border-t border-slate-200/90 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
          Why the rate moves
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {RATE_LADDER.map((rung) => (
            <li
              key={rung.key}
              className="flex items-baseline justify-between gap-4 text-sm text-slate-600"
            >
              <span>
                {rung.label}
                <span className="text-slate-500"> &mdash; {rung.detail}</span>
              </span>
              <span className="shrink-0 font-semibold text-[#0B1F3A]">
                {formatPerReport(rung.rate)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default VolumePicker;
