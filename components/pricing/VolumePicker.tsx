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

/**
 * The figure the field is asking for, or null when what has been typed is not
 * a whole number this picker can quote.
 *
 * Digits only on purpose. `type="number"` also admits "1e5", "1.5" and "-3",
 * and `Number.parseInt` reads those as 1, 1 and -3 — a silently wrong quote.
 * Anything this rejects leaves the last legal figure driving the quote, so
 * `planForVolume` is never called with a value it would throw on.
 */
function parseReports(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < MIN_REPORTS || parsed > MAX_REPORTS) return null;
  return parsed;
}

/** Singular/plural for a counted noun the copy interpolates. */
function reportWord(count: number): string {
  return count === 1 ? "report" : "reports";
}

/** Pack sizes as sold, smallest first — the granularity behind every overshoot. */
const PACK_SIZES = Object.values(PRICING_CONFIG.addons)
  .map((addon) => addon.reportLimit as number)
  .sort((a, b) => a - b);

const SMALLEST_PACK = PACK_SIZES[0] ?? 0;

const PACK_SIZE_LIST =
  PACK_SIZES.length > 1
    ? `${PACK_SIZES.slice(0, -1).join(", ")} and ${PACK_SIZES[PACK_SIZES.length - 1]}`
    : String(SMALLEST_PACK);

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
  const noticeId = `${fieldId}-notice`;

  // Two pieces of state, deliberately. `raw` is exactly what the contractor has
  // typed, so nothing is rewritten under their fingers mid-entry. `reports` is
  // the last figure this picker can actually quote, so `planForVolume` never
  // sees a value it would throw on. When the two disagree the mismatch is shown
  // and announced instead of being swallowed.
  const [raw, setRaw] = useState(() => String(clampReports(initialReports)));
  const [reports, setReports] = useState(() => clampReports(initialReports));

  const trimmed = raw.trim();
  const typed = parseReports(raw);
  const mismatch = typed !== reports;

  /** Set field and quote together — steppers, presets, and blur all land here. */
  const commit = (next: number) => {
    const clamped = clampReports(next);
    setRaw(String(clamped));
    setReports(clamped);
  };

  const handleChange = (value: string) => {
    setRaw(value);
    const next = parseReports(value);
    if (next !== null) setReports(next);
  };

  const handleBlur = () => {
    const digits = /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
    if (digits === null) {
      setRaw(String(reports));
      return;
    }
    commit(digits);
  };

  const atMax = reports >= MAX_REPORTS;
  const atMin = reports <= MIN_REPORTS;

  /**
   * One line of feedback, highest-priority first: a field that disagrees with
   * the quote beats a bound the contractor has simply reached.
   */
  const notice = ((): string | null => {
    if (mismatch) {
      if (trimmed === "") {
        return `Type a number from ${MIN_REPORTS} to ${MAX_REPORTS}. The figures below are still for ${reports} ${reportWord(reports)} a month.`;
      }
      if (!/^\d+$/.test(trimmed)) {
        return `That is not a whole number of reports, so the figures below are for ${reports} ${reportWord(reports)} a month.`;
      }
      const asNumber = Number.parseInt(trimmed, 10);
      if (asNumber > MAX_REPORTS) {
        return `This picker goes up to ${MAX_REPORTS} reports a month, so the figures below are for ${reports}, not ${asNumber}. Writing more than that? Talk to us about a volume plan.`;
      }
      return `A per-report figure needs at least ${MIN_REPORTS} report a month, so the figures below are for ${reports}, not ${asNumber}.`;
    }
    if (atMax) {
      return `${MAX_REPORTS} a month is the most this picker covers. Talk to us about a volume plan above that.`;
    }
    if (atMin) {
      return `${MIN_REPORTS} a month is the fewest this picker covers.`;
    }
    return null;
  })();

  const quote = useMemo(() => planForVolume(reports), [reports]);

  const overshoot = quote.reportsProvided - quote.reportsPerMonth;
  const effectiveRate = formatPerReport(quote.effectiveRate);

  // Two very different reasons produce spare reports, and they need different
  // copy. Below the plan allowance nothing was bought at all — the spare comes
  // from the plan's own 50. Above it, the spare comes from the pack combination.
  const packSpare = quote.packs.length > 0 && overshoot > 0;
  const planSpare = quote.packs.length === 0 && overshoot > 0;

  const singlePack =
    quote.packs.length === 1 && quote.packs[0].qty === 1 ? quote.packs[0] : null;
  const singlePackSize = singlePack
    ? (PRICING_CONFIG.addons[singlePack.pack].reportLimit as number)
    : 0;
  /**
   * True only when ONE pack, bought once, covers the whole overage on its own
   * and is not merely the smallest block sold. `planForVolume` is a min-cost
   * cover, so in that case no mix of smaller packs covers the same overage for
   * less — the only situation where "buying up is cheaper" is the real reason.
   * Every other overshoot is block granularity, not pack value: at 80 reports
   * the optimiser buys a 25-pack and an 8-pack, the two DEAREST packs per
   * report, purely because 30 is not a buyable amount.
   */
  const boughtUpForValue =
    singlePack !== null &&
    singlePackSize > quote.overage &&
    singlePackSize > SMALLEST_PACK;

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
            onClick={() => {
              if (atMin) return;
              commit(reports - STEP);
            }}
            // aria-disabled, not disabled: the minimum is reachable by stepping,
            // and a `disabled` button drops out of the tab order under the
            // contractor's own focus, dumping them on <body> mid-interaction.
            aria-disabled={atMin}
            aria-label={
              atMin
                ? `Fewer reports — already at the minimum of ${MIN_REPORTS}`
                : `Fewer reports, decrease by ${STEP}`
            }
            aria-controls={fieldId}
            className={cn(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              "border border-slate-300/90 bg-white text-2xl font-semibold text-[#0B1F3A]",
              "transition-colors duration-150 ease-out hover:border-slate-400 hover:bg-[#F3F5F7]",
              atMin &&
                "cursor-not-allowed opacity-40 hover:border-slate-300/90 hover:bg-white",
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
            aria-describedby={notice ? `${hintId} ${noticeId}` : hintId}
            aria-invalid={mismatch}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={handleBlur}
            className={cn(
              FONT_DISPLAY,
              "h-12 w-28 rounded-xl border border-slate-300/90 bg-white text-center",
              "text-2xl font-semibold tracking-tight text-[#0B1F3A]",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              mismatch && "border-[#B4471F] text-[#B4471F]",
              FOCUS,
            )}
          />

          <button
            type="button"
            onClick={() => {
              if (atMax) return;
              commit(reports + STEP);
            }}
            // aria-disabled, not disabled: STEP divides evenly into the default,
            // so the maximum lands exactly on a tap and a `disabled` button
            // would vanish from the tab order with focus still on it.
            aria-disabled={atMax}
            aria-label={
              atMax
                ? `More reports — already at the maximum of ${MAX_REPORTS}`
                : `More reports, increase by ${STEP}`
            }
            aria-controls={fieldId}
            className={cn(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              "border border-slate-300/90 bg-white text-2xl font-semibold text-[#0B1F3A]",
              "transition-colors duration-150 ease-out hover:border-slate-400 hover:bg-[#F3F5F7]",
              atMax &&
                "cursor-not-allowed opacity-40 hover:border-slate-300/90 hover:bg-white",
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

        {/*
          Visible mismatch / bound feedback. Not a live region itself — the
          role="status" summary below carries the same sentence, so announcing
          it here as well would read it out twice.
        */}
        {notice ? (
          <p
            id={noticeId}
            className={cn(
              "mt-2 flex items-start gap-2 text-xs leading-relaxed",
              mismatch ? "text-[#B4471F]" : "text-slate-500",
            )}
          >
            {mismatch ? (
              <span className="mt-0.5 shrink-0">
                <RAIcon name="warning" size={14} decorative />
              </span>
            ) : null}
            <span>{notice}</span>
          </p>
        ) : null}

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
                  onClick={() => commit(preset)}
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
              Software cost per report
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
              {quote.reportsPerMonth === 1
                ? "on the 1 report you write."
                : `on each of the ${quote.reportsPerMonth} reports you write.`}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Software only. Generating a report also runs on your own Anthropic
              or OpenAI key, and that provider bills you for it directly.
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
                Report packs to cover the {quote.overage}{" "}
                {reportWord(quote.overage)} beyond your plan allowance
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
                No packs needed &mdash; the {quote.baseIncluded} reports in your
                plan cover the {quote.reportsPerMonth} you write.
              </span>
            </li>
          )}
        </ul>

        {/* Honest overshoot disclosure — pack-caused spare. */}
        {packSpare ? (
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
              Packs come in fixed blocks of {PACK_SIZE_LIST} reports. Buying{" "}
              {quote.packs.map((purchase, index) => (
                <span key={purchase.pack}>
                  {index === 0
                    ? ""
                    : index === quote.packs.length - 1
                      ? " and "
                      : ", "}
                  {purchase.qty} &times;{" "}
                  {PRICING_CONFIG.addons[purchase.pack].displayName}
                </span>
              ))}{" "}
              is the cheapest combination that covers the {quote.overage}{" "}
              {reportWord(quote.overage)} you need beyond your plan, and it runs{" "}
              {overshoot} over.{" "}
              {boughtUpForValue
                ? "No mix of smaller packs covers that for less, so buying the bigger block really is the cheaper move."
                : quote.overage < SMALLEST_PACK
                  ? `The smallest pack sold is ${SMALLEST_PACK} reports, so going even one over your plan means buying ${SMALLEST_PACK}.`
                  : "The spare reports are what the block sizes leave behind, not a bulk discount."}
            </p>
            <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600">
              The rate above is worked out over the {quote.reportsPerMonth}{" "}
              {reportWord(quote.reportsPerMonth)} you actually write, so the
              spare ones are not flattering the figure.
            </p>
          </div>
        ) : null}

        {/* Honest disclosure — spare that comes from the plan, with no pack bought. */}
        {planSpare ? (
          <div className="mt-5 rounded-xl border border-[#3B6D8C]/25 bg-white p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-[#0B1F3A]">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="moisture" size={16} decorative />
              </span>
              <span>
                Your plan includes {quote.baseIncluded} reports &mdash;{" "}
                {overshoot} more than the {quote.reportsPerMonth} you asked for.
              </span>
            </p>
            <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600">
              No packs are involved here. The plan is the smallest thing we
              sell, so at {quote.reportsPerMonth}{" "}
              {reportWord(quote.reportsPerMonth)} a month you still pay the full{" "}
              {AUD.format(MONTHLY.amount)} and {overshoot} of the{" "}
              {quote.baseIncluded} {overshoot === 1 ? "goes" : "go"} unused.
              That is why the rate above is{" "}
              {effectiveRate}: it spreads the plan across the{" "}
              {quote.reportsPerMonth} {reportWord(quote.reportsPerMonth)} you
              actually write, not the {quote.baseIncluded} available to you.
            </p>
          </div>
        ) : null}
      </div>

      {/* Screen-reader summary of the live result. */}
      <p role="status" aria-live="polite" className="sr-only">
        {/* The mismatch goes first: the figures mean nothing until you know
            which number they were worked out for. */}
        {notice ? `${notice} ` : ""}
        At {quote.reportsPerMonth} {reportWord(quote.reportsPerMonth)} a month:{" "}
        {AUD.format(quote.totalAud)} per month, {effectiveRate} per report in
        software, plus your own AI provider&rsquo;s charges.{" "}
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
