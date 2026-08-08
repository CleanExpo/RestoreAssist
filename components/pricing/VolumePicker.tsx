"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RAIcon } from "@/components/brand/RAIcon";
import { cn } from "@/lib/utils";
import { FONT_DISPLAY, SURFACE } from "@/components/landing/home/motion";
import {
  formatPerReport,
  packRung,
  perReportRate,
  planForVolume,
  PACK_LADDER,
  PACK_SIZES,
} from "@/lib/pricing/unit-rate";

/**
 * Volume picker for the public pricing page.
 *
 * The contractor sets the reports they write in a month and immediately sees
 * the plan, the packs added on top, what the first month costs, what every
 * month after costs, and — the numbers this page exists to make legible — the
 * effective rate per report for each.
 *
 * All pricing arithmetic comes from `@/lib/pricing/unit-rate`. This component
 * only formats and lays out what the quote returns; it must never recompute a
 * total, a pack split, or a rate of its own.
 *
 * THAT INCLUDES THE PACK LADDER. This file used to rebuild it from
 * `PRICING_CONFIG.addons` with no filter and a `reportLimit as number` cast,
 * defeating the fail-closed filter `unit-rate.ts` exists for: register one
 * non-report add-on there and the buyer-facing sentence read "blocks of 8, 25,
 * 60 and undefined reports", while the rate card grew a row saying "undefined
 * reports for $11.00 — —". `PACK_LADDER` is the single source now.
 */

const MIN_REPORTS = 1;
const MAX_REPORTS = 500;
/** Reports per tap on the stepper. Exact figures go in the field directly. */
const STEP = 5;
const PRESETS = [50, 80, 120, 200] as const;
/**
 * How long the figures must sit still before the live region is updated.
 *
 * The summary is one text node holding the notice and a thirty-word quote
 * sentence, and `aria-live="polite"` re-reads the whole thing on every change.
 * Undebounced, typing "120" queues three complete announcements and a phone
 * screen reader talks over the rest of the interaction. 600ms is longer than
 * the gap between keystrokes in a three-digit number and short enough that the
 * result still feels immediate once typing stops. The announcement is delayed,
 * never dropped.
 */
const ANNOUNCE_DELAY_MS = 600;

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
 *
 * The cadence is spelled out on each rung rather than left to the reader: the
 * plan is billed every month, a pack is billed once. Rows come from
 * `PACK_LADDER`, so a malformed add-on is dropped here as well as in the maths.
 */
const RATE_LADDER = [
  {
    key: "plan",
    label: MONTHLY.displayName,
    detail: `${MONTHLY.reportLimit} reports for ${AUD.format(MONTHLY.amount)} a month`,
    rate: perReportRate(MONTHLY.amount, MONTHLY.reportLimit),
  },
  ...PACK_LADDER.map((rung) => ({
    key: rung.pack,
    label: rung.displayName,
    detail: `${rung.reports} reports for ${AUD.format(rung.amountAud)}, bought once`,
    rate: rung.rate,
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
  const firstMonthRate = formatPerReport(quote.firstMonthRate);
  const ongoingRate = formatPerReport(quote.ongoingRate);

  /**
   * Whether anything one-off is being bought. Only then do the first month and
   * every month after differ, and only then is a split worth the extra reading.
   */
  const buysPacks = quote.packs.length > 0;

  // Two very different reasons produce spare reports, and they need different
  // copy. Below the plan allowance nothing was bought at all — the spare comes
  // from the plan's own 50. Above it, the spare comes from the pack combination.
  const packSpare = buysPacks && overshoot > 0;
  const planSpare = !buysPacks && overshoot > 0;

  /**
   * The whole spoken summary as one string, so the debounce below has a single
   * value to settle on. The mismatch goes first: the figures mean nothing until
   * you know which number they were worked out for.
   */
  const summary =
    (notice ? `${notice} ` : "") +
    `At ${quote.reportsPerMonth} ${reportWord(quote.reportsPerMonth)} a month: ` +
    (buysPacks
      ? `${AUD.format(quote.firstMonthAud)} in the first month, then ${AUD.format(quote.ongoingMonthlyAud)} a month. ` +
        `That is ${firstMonthRate} per report to start and ${ongoingRate} per report from the second month on, in software, plus your own AI provider's charges. ` +
        `${quote.reportsProvided} reports available each month.`
      : `${AUD.format(quote.ongoingMonthlyAud)} a month, ${ongoingRate} per report for plan and packs, plus your own AI provider's charges. ` +
        `${quote.reportsProvided} reports available each month.`);

  /**
   * What the live region is currently holding. Lags `summary` by
   * {@link ANNOUNCE_DELAY_MS}, so a screen-reader user hears the settled
   * figures once instead of one announcement per keystroke.
   */
  const [announcement, setAnnouncement] = useState(summary);

  useEffect(() => {
    // Every change restarts the timer, so only a pause in typing announces.
    // React bails out of an identical state write, so a value that comes back
    // to where it started costs no re-render and no second announcement.
    const timer = setTimeout(() => setAnnouncement(summary), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [summary]);

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
        {/*
          Two figures, not one, whenever a pack is involved. The packs are a
          one-off charge that raises the monthly allowance permanently
          (`mode: "payment"` at checkout, `addonReports: { increment }` at
          fulfilment, and nothing in the codebase ever winds it back), so a
          single blended "total each month" is right for the buying month and
          roughly double the truth for every month after it.
        */}
        {buysPacks ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
                Your first month
              </p>
              <p
                className={cn(
                  FONT_DISPLAY,
                  "mt-2 text-4xl font-semibold tracking-tight text-[#0B1F3A] sm:text-5xl",
                )}
              >
                {AUD.format(quote.firstMonthAud)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {firstMonthRate} per report &mdash; the plan plus the report
                packs, which you buy once.
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
                Every month after
              </p>
              <p
                className={cn(
                  FONT_DISPLAY,
                  "mt-2 text-4xl font-semibold tracking-tight text-[#0B1F3A] sm:text-5xl",
                )}
              >
                {AUD.format(quote.ongoingMonthlyAud)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {ongoingRate} per report, on the same {quote.reportsProvided} a
                month.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
                Plan and packs, per report
              </p>
              <p
                className={cn(
                  FONT_DISPLAY,
                  "mt-2 text-4xl font-semibold tracking-tight text-[#0B1F3A] sm:text-5xl",
                )}
              >
                {ongoingRate}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {quote.reportsPerMonth === 1
                  ? "on the 1 report you write."
                  : `on each of the ${quote.reportsPerMonth} reports you write.`}
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
                {AUD.format(quote.ongoingMonthlyAud)}
              </p>
            </div>
          </div>
        )}

        {buysPacks ? (
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            The report packs are a one-off purchase, not a second subscription.
            The reports they add stay on your account, so from month two you are
            back to the {MONTHLY.displayName} plan alone and still have{" "}
            {quote.reportsProvided} reports a month to write against.
          </p>
        ) : null}

        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          AUD, incl. GST. Cancel any time. Software only &mdash; generating a
          report also runs on your own Anthropic or OpenAI key, and that
          provider bills you for it directly.
        </p>

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
              {AUD.format(MONTHLY.amount)} a month
            </span>
          </li>

          {quote.packs.map((purchase) => {
            // From the filtered ladder, never the raw catalogue — a malformed
            // add-on must not be able to render "undefined reports" here.
            const rung = packRung(purchase.pack);
            if (!rung) return null;
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
                    {purchase.qty} &times; {rung.displayName} &mdash;{" "}
                    {rung.reports} reports at {AUD.format(rung.amountAud)} each
                  </span>
                </span>
              </li>
            );
          })}

          {buysPacks ? (
            <li className="flex items-start justify-between gap-4 text-slate-600">
              <span className="pl-6">
                Report packs to cover the {quote.overage}{" "}
                {reportWord(quote.overage)} beyond your plan allowance
              </span>
              <span className="shrink-0 font-semibold text-[#0B1F3A]">
                {AUD.format(quote.packsTotalAud)} once
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
                {quote.reportsProvided} reports available each month &mdash;{" "}
                {overshoot} more than the {quote.reportsPerMonth} you asked for.
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
                  {purchase.qty} &times; {packRung(purchase.pack)?.displayName}
                </span>
              ))}{" "}
              is the cheapest combination that covers the {quote.overage}{" "}
              {reportWord(quote.overage)} you need beyond your plan, and it runs{" "}
              {overshoot} over.
            </p>
            {/*
              The two causes of that excess, kept apart. Blaming all of it on
              block granularity was false wherever an equally cheap, leaner
              combination existed — at 152 a month, 8 of the 18 spare reports
              are the blocks and the other 10 are the choice.
            */}
            <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600">
              {quote.spareFromBuyingUp > 0 && quote.spareFromBlockSizes > 0
                ? `${quote.spareFromBlockSizes} of those spare ${reportWord(quote.spareFromBlockSizes)} are what the fixed blocks leave behind. The other ${quote.spareFromBuyingUp} we could have left out: a leaner combination covering the same ${quote.overage} costs exactly the same, so we quote the one that leaves you more.`
                : quote.spareFromBuyingUp > 0
                  ? `A combination fitting your ${quote.overage} exactly is available for the same money, so none of the spare ${reportWord(overshoot)} are forced by the block sizes. We quote the larger one because at an identical price it leaves you more.`
                  : quote.overage < SMALLEST_PACK
                    ? `The smallest pack sold is ${SMALLEST_PACK} reports, so going even one over your plan means buying ${SMALLEST_PACK}.`
                    : "Every spare report there is what the block sizes leave behind: no cheaper combination, and no equally cheap one, gets closer to what you need."}
            </p>
            <p className="mt-2 pl-6 text-sm leading-relaxed text-slate-600">
              Both rates above are worked out over the {quote.reportsPerMonth}{" "}
              {reportWord(quote.reportsPerMonth)} you actually write, so the
              spare ones are not flattering the figures.
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
              That is why the rate above is {ongoingRate}: it spreads the plan
              across the{" "}
              {quote.reportsPerMonth} {reportWord(quote.reportsPerMonth)} you
              actually write, not the {quote.baseIncluded} available to you.
            </p>
          </div>
        ) : null}
      </div>

      {/*
        Screen-reader summary of the live result, DEBOUNCED.

        This node holds the notice and the whole quote sentence, and
        aria-live="polite" re-reads all of it on any change. Bound directly to
        the quote, typing "120" queued three full announcements and a phone
        screen reader spent the rest of the interaction talking. It now renders
        `announcement`, which trails the figures by ANNOUNCE_DELAY_MS, so an
        unbroken run of keystrokes produces exactly one settled announcement.
        The visible figures are not debounced — they update immediately.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
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
