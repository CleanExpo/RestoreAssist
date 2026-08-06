"use client";

import { motion } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RAIcon } from "@/components/brand/RAIcon";
import type { RAIconName } from "@/lib/brand/icon-registry";
import {
  fadeUp,
  staggerContainer,
  VIEWPORT,
  CONTAINER,
  SECTION_PAD,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  FONT_DISPLAY,
  SURFACE,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

/**
 * SSOT GAP — READ BEFORE EDITING.
 *
 * These five paid-only capabilities have no home in `PRICING_CONFIG`. They are
 * currently hand-rolled as five repeated <li> blocks inside
 * `app/pricing/page.tsx`, which means the pricing page advertises capabilities
 * that the pricing single-source-of-truth has never heard of. They are lifted
 * here as structured data so the page can stop hand-rolling JSX, but this
 * const is a BRIDGE, not a second source of truth.
 *
 * The fix is to move these strings into
 * `PRICING_CONFIG.pricing.monthly.features` (or a dedicated
 * `paidOnlyFeatures` key covered by `lib/__tests__/pricing-integrity.test.ts`)
 * and then delete this block, reading from the config instead.
 */
const PAID_ONLY = {
  quickFill: "Unlimited Quick Fill (AI-powered form auto-fill)",
  reportTypes: "Enhanced & Optimised report types",
  pdfUpload: "PDF upload & processing",
  configuration: "Full profile & pricing configuration",
  premiumApi: "Premium API integrations (Claude, GPT, etc.)",
} as const;

/** The five strings above, for any surface that needs to render them as a list. */
export const PAID_ONLY_CAPABILITIES = Object.values(PAID_ONLY);

const free = PRICING_CONFIG.free;
const paid = PRICING_CONFIG.pricing.monthly;
const addons = PRICING_CONFIG.addons;

const paidPrice =
  paid.amount % 1 === 0 ? `$${paid.amount}` : `$${paid.amount.toFixed(2)}`;

type Cell = {
  /** Whether the plan grants this capability at all. */
  included: boolean;
  /** What the plan actually grants. Omit for a plain included / not included. */
  label?: string;
};

type ComparisonRow = {
  capability: string;
  free: Cell;
  paid: Cell;
  /** Clarifies a difference a tick and a dash cannot express on their own. */
  note?: string;
  /** Lifted into the upgrade summary at the top of the section. */
  headline?: boolean;
};

type ComparisonGroup = {
  /** Grouped by the outcome a buyer is shopping for, not by internal module. */
  theme: string;
  icon: RAIconName;
  rows: readonly ComparisonRow[];
};

const GROUPS: readonly ComparisonGroup[] = [
  {
    theme: "How many reports you get",
    icon: "report",
    rows: [
      {
        capability: "Inspection reports",
        free: {
          included: true,
          label: `${free.trialReportCredits} credits, once, across the ${free.trialDays}-day trial`,
        },
        paid: {
          included: true,
          label: `${paid.reportLimit} reports every ${paid.interval}`,
        },
        note: `Same ${paid.reportLimit} reports — the change is that the allowance comes back every ${paid.interval} instead of running out with the trial.`,
        headline: true,
      },
      {
        capability: "First-month bonus reports",
        free: { included: false },
        paid: {
          included: true,
          label: `+${paid.signupBonus} reports on your first ${paid.interval}`,
        },
      },
      {
        capability: "Quick Fill (AI form auto-fill)",
        free: {
          included: true,
          label: `${free.trialQuickFillCredits} credits, once`,
        },
        paid: { included: true, label: PAID_ONLY.quickFill },
        headline: true,
      },
      {
        capability: "Top up with extra report packs",
        free: { included: false, label: "Subscription required" },
        paid: {
          included: true,
          label: `Add ${addons.pack8.reportLimit}, ${addons.pack25.reportLimit} or ${addons.pack60.reportLimit} reports from $${addons.pack8.amount}`,
        },
      },
    ],
  },
  {
    theme: "What the reports can do",
    icon: "inspection",
    rows: [
      {
        capability: "Report types",
        free: { included: true, label: "Basic report type" },
        paid: { included: true, label: `Basic, plus ${PAID_ONLY.reportTypes}` },
        headline: true,
      },
      {
        capability: "IICRC S500 compliant reports",
        free: { included: true },
        paid: { included: true },
      },
      {
        capability: PAID_ONLY.pdfUpload,
        free: { included: false },
        paid: { included: true },
        headline: true,
      },
      {
        capability: "Priority processing",
        free: { included: false },
        paid: { included: true },
      },
    ],
  },
  {
    theme: "Getting work out of the system",
    icon: "ai",
    rows: [
      {
        capability: "PDF & Excel export",
        free: { included: true },
        paid: { included: true },
      },
      {
        capability: "Integrations",
        free: { included: false },
        paid: { included: true, label: "All integrations" },
      },
      {
        capability: "Premium API integrations",
        free: { included: false },
        paid: { included: true, label: PAID_ONLY.premiumApi },
      },
    ],
  },
  {
    theme: "Setting the business up",
    icon: "shield",
    rows: [
      {
        capability: "Profile & pricing configuration",
        free: { included: false },
        paid: { included: true, label: PAID_ONLY.configuration },
      },
      {
        capability: "Support",
        free: { included: true, label: "Email support" },
        paid: { included: true, label: "Email support" },
      },
    ],
  },
];

const HEADLINE_ROWS = GROUPS.flatMap((group) => group.rows).filter(
  (row) => row.headline,
);

function cellText(cell: Cell): string {
  return cell.label ?? (cell.included ? "Included" : "Not included");
}

/**
 * The plan name is visible on mobile (where the columns stack and the header
 * row is off screen) and screen-reader-only from `sm` up (where the column
 * header carries it) — never removed from the accessibility tree.
 */
function CellBody({ planLabel, cell }: { planLabel: string; cell: Cell }) {
  return (
    <>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:sr-only">
        {planLabel}
      </span>
      {cell.included ? (
        <span className="flex items-start gap-2 text-[15px] leading-[1.6] text-slate-700">
          <span className="mt-0.5 text-[#3B6D8C]">
            <RAIcon name="success" size={16} decorative />
          </span>
          <span>{cell.label ?? "Included"}</span>
        </span>
      ) : cell.label ? (
        <span className="block text-[15px] leading-[1.6] text-slate-400">
          {cell.label}
        </span>
      ) : (
        <span className="block text-[15px] leading-[1.6] text-slate-400">
          <span aria-hidden="true">&mdash;</span>
          <span className="sr-only">Not included</span>
        </span>
      )}
    </>
  );
}

/**
 * Free Trial versus the paid Monthly plan, grouped by the outcome a buyer is
 * shopping for. Every capability and number is read from `PRICING_CONFIG`,
 * except the five paid-only strings flagged in the SSOT GAP note above.
 *
 * Layout note: this is a single CSS grid that collapses from three columns to
 * one at the `sm` breakpoint, so nothing ever overflows a phone viewport —
 * there is no horizontally scrolling table.
 */
export function TierComparison() {
  const reduce = useLandingReduceMotion();

  return (
    <section
      className={`border-t border-slate-200/90 bg-[#F3F5F7] ${SECTION_PAD}`}
      aria-labelledby="tier-comparison-heading"
    >
      <div className={CONTAINER}>
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
        >
          <div className="max-w-[42rem]">
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Free trial vs paid
            </motion.p>
            <motion.h2
              id="tier-comparison-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Exactly what changes when you start paying
            </motion.h2>
            <motion.p variants={fadeUp} className={SECTION_BODY}>
              Two plans, side by side, grouped by what you are actually buying.
              No feature-list archaeology required.
            </motion.p>
          </div>

          <motion.div
            variants={fadeUp}
            className="mt-12 rounded-2xl bg-[#0B1F3A] p-7 text-white shadow-[0_1px_2px_rgba(11,31,58,0.1),0_10px_28px_rgba(11,31,58,0.12)] sm:p-9"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8FB2C9]">
              The real delta
            </p>
            <h3
              className={`${FONT_DISPLAY} mt-3 text-2xl font-semibold tracking-tight sm:text-[1.7rem]`}
            >
              What {paidPrice} a {paid.interval} actually buys you
            </h3>

            <ul className="mt-7 grid gap-4 sm:grid-cols-2">
              {HEADLINE_ROWS.map((row) => (
                <li
                  key={row.capability}
                  className="rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8FB2C9]">
                    {row.capability}
                  </p>
                  <p className="mt-2 text-[15px] leading-[1.6]">
                    <span className="text-white/55">{cellText(row.free)}</span>
                    <span aria-hidden="true" className="px-2 text-white/40">
                      &rarr;
                    </span>
                    <span className="sr-only"> becomes </span>
                    <span className="font-semibold text-white">
                      {cellText(row.paid)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-7 max-w-[44rem] border-t border-white/15 pt-6 text-[15px] leading-[1.72] text-white/75">
              Read the first card carefully, because it is the one most pricing
              pages fudge: your report allowance does not get bigger. The trial
              grants {free.trialReportCredits} report credits for{" "}
              {free.trialDays} days; the paid plan grants {paid.reportLimit}{" "}
              reports every {paid.interval}. What you are buying is recurrence
              — an allowance that comes back — plus the paid-only capabilities
              in the table below.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className={`${SURFACE} mt-8 overflow-hidden p-6 sm:p-8`}
          >
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
              {/* Column header — carries plan identity from `sm` up. */}
              <div className="hidden sm:block sm:pb-4" aria-hidden="true" />
              <div className="hidden sm:block sm:pb-4">
                <p
                  className={`${FONT_DISPLAY} text-[15px] font-semibold text-[#0B1F3A]`}
                >
                  {free.displayName}
                </p>
                <p className="mt-1 text-[13px] text-slate-500">
                  $0 &middot; {free.trialDays} days &middot; no credit card
                </p>
              </div>
              <div className="hidden sm:block sm:rounded-t-xl sm:bg-[#F7F9FB] sm:px-5 sm:pb-4 sm:pt-4">
                <p
                  className={`${FONT_DISPLAY} text-[15px] font-semibold text-[#0B1F3A]`}
                >
                  {paid.displayName}
                </p>
                <p className="mt-1 text-[13px] text-slate-500">
                  {paidPrice} {paid.currency} / {paid.interval} &middot; cancel
                  any time
                </p>
              </div>

              {GROUPS.map((group) => (
                <div key={group.theme} className="contents">
                  <h3 className="col-span-full flex items-center gap-2 border-t-2 border-[#0B1F3A]/15 pb-1 pt-7 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3B6D8C]">
                    <RAIcon name={group.icon} size={16} decorative />
                    {group.theme}
                  </h3>

                  {group.rows.map((row) => (
                    <div key={row.capability} className="contents">
                      <div className="border-t border-slate-200/90 pb-3 pt-5 text-[15px] font-semibold leading-[1.5] tracking-[-0.01em] text-[#0B1F3A] sm:py-5 sm:pr-6">
                        {row.capability}
                      </div>
                      <div className="pb-3 sm:border-t sm:border-slate-200/90 sm:py-5">
                        <CellBody planLabel={free.displayName} cell={row.free} />
                      </div>
                      <div className="pb-5 sm:border-t sm:border-slate-200/90 sm:bg-[#F7F9FB] sm:px-5 sm:py-5">
                        <CellBody planLabel={paid.displayName} cell={row.paid} />
                        {row.note ? (
                          <p className="mt-2 text-[13px] leading-[1.6] text-[#3B6D8C]">
                            {row.note}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default TierComparison;
