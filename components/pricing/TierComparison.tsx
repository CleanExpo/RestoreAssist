"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";
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
  // "Unlimited Quick Fill" and "Premium API integrations" used to sit here and
  // were both FALSE as paid-only claims, verified against the handlers:
  //
  //   - app/api/user/quick-fill-credits/route.ts returns hasUnlimited: true for
  //     `isTrialWithinPeriod` exactly as it does for ACTIVE. A trial user has
  //     unlimited Quick Fill too. The real difference is only what happens when
  //     the window closes, which is what the row now says.
  //   - app/api/onboarding/status/route.ts (RA-6932) records that trial AND
  //     paid users are both hard-402'd on report generation without their own
  //     BYOK key. The AI key is required for everyone, so it cannot be sold as
  //     an upgrade. That row is gone rather than reworded.
  //
  // Also dropped "AI-powered" from the Quick Fill wording: the shipped Quick
  // Fill copies hardcoded scenario data, and `generateQuickFillData`
  // (lib/deepseek-api.ts:74) has zero callers anywhere in the repo.
  quickFill: "Quick Fill stays unlimited after the trial ends",
  reportTypes: "Enhanced & Optimised report types",
  pdfUpload: "PDF upload & processing",
  configuration: "Full profile & pricing configuration",
} as const;

/** The five strings above, for any surface that needs to render them as a list. */
export const PAID_ONLY_CAPABILITIES = Object.values(PAID_ONLY);

const free = PRICING_CONFIG.free;
const paid = PRICING_CONFIG.pricing.monthly;
const addons = PRICING_CONFIG.addons;

const paidPrice =
  paid.amount % 1 === 0 ? `$${paid.amount}` : `$${paid.amount.toFixed(2)}`;

/**
 * The recurring add-ons the checkout can sell, read from
 * lib/billing/addon-registry.ts. Three of them ARE integrations — Online
 * Bookkeeping Connection, Service CRM Connection, Payments Collection — which
 * is why the Integrations row below can no longer say "All integrations". The
 * count and the entry price are derived here so this row cannot drift when an
 * add-on is registered or repriced; the full itemised list with every price
 * lives in CostDisclosure.
 */
const RECURRING_ADDON_LIST = Object.values(RECURRING_ADDONS);
const CHEAPEST_ADDON_AMOUNT = Math.min(
  ...RECURRING_ADDON_LIST.map((addon) => addon.amount),
);
const CHEAPEST_ADDON_PRICE =
  CHEAPEST_ADDON_AMOUNT % 1 === 0
    ? `$${CHEAPEST_ADDON_AMOUNT}`
    : `$${CHEAPEST_ADDON_AMOUNT.toFixed(2)}`;
const ADDON_INTERVAL = RECURRING_ADDON_LIST[0]?.interval ?? paid.interval;

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
        capability: "Quick Fill (form auto-fill)",
        free: {
          included: true,
          label: `Unlimited during the trial, then ${free.trialQuickFillCredits} credits`,
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
        // NOT "IICRC S500 compliant". lib/iicrc-inclusion-check.ts sets the
        // hard rule that this product never asserts "complies", "certifies",
        // "meets [the standard]" or "required by law" (regression-tested in
        // lib/__tests__/iicrc-inclusion-check.test.ts), and full S500 clause
        // ingestion is blocked pending legal clearance. Alignment is what the
        // build supports and what app/features/page.tsx now claims: the
        // section index ships, the licensed wording does not.
        capability: "IICRC S500:2021 section structure",
        free: { included: true },
        paid: { included: true },
        note: "Reports are structured on, and cite, indexed S500:2021 section numbers. That is alignment with the standard, not certification against it — no one is certifying your job but you.",
      },
      {
        capability: PAID_ONLY.pdfUpload,
        free: { included: false },
        paid: { included: true },
        headline: true,
      },
      // "Priority processing" was removed, not reworded. Unlike the report-type
      // rows — which are real capabilities merely gated client-side — this one
      // has no implementation anywhere. Searching app/, lib/ and components/
      // for "priority" returns only the sitemap's SEO weights; there is no
      // queue, no priority column, no ordering logic, and trial and paid share
      // identical rate limits on the generation route. It was a tier difference
      // that did not exist.
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
        // "All integrations" was the claim here and in
        // PRICING_CONFIG.pricing.monthly.features. It was wrong: bookkeeping,
        // service CRM and payments are each a SEPARATE recurring subscription
        // in lib/billing/addon-registry.ts, on top of the $99 plan.
        capability: "Integrations",
        free: { included: false, label: "Subscription required" },
        paid: {
          included: true,
          label: "Available to switch on, priced separately",
        },
        note: `Integrations are not bundled into the ${paidPrice}. They are ${RECURRING_ADDON_LIST.length} optional recurring add-ons from ${CHEAPEST_ADDON_PRICE} per ${ADDON_INTERVAL} each, itemised in full in the cost disclosure below.`,
      },
      // The "Premium API integrations" row was removed, not reworded. Report
      // generation runs on the customer's own Anthropic or OpenAI key on EVERY
      // plan — app/api/onboarding/status/route.ts (RA-6932) makes the key a
      // required onboarding step for trial users too, and both tiers are
      // hard-402'd without one. There is no upgrade here to sell.
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

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The entrance animation is an ENHANCEMENT, never a precondition for reading
 * this comparison.
 *
 * framer-motion resolves `initial="hidden"` during server rendering, so this
 * section used to ship as `style="opacity:0;transform:translateY(16px)"` —
 * server-rendered but invisible until a `whileInView` reveal ran. With
 * JavaScript blocked, slow or failed, the best content on the pricing page was
 * a blank block.
 *
 * So the server render, and the first client render that must hydrate against
 * it, pass `initial={false}`: framer-motion emits no initial state and the
 * markup arrives visible. The reveal is armed only after hydration. Arming
 * changes the subtree `key`, re-mounting it with the hidden initial state;
 * because that commits in a LAYOUT effect it happens before the browser
 * paints, so users who do get JavaScript still see the full animation with no
 * flash of un-animated content.
 */
function useRevealArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useIsomorphicLayoutEffect(() => setArmed(true), []);
  return armed;
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
  const armed = useRevealArmed();

  return (
    <section
      className={`border-t border-slate-200/90 bg-[#F3F5F7] ${SECTION_PAD}`}
      aria-labelledby="tier-comparison-heading"
    >
      <div className={CONTAINER}>
        <motion.div
          key={armed ? "reveal-armed" : "reveal-static"}
          variants={staggerContainer}
          initial={armed && !reduce ? "hidden" : false}
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
