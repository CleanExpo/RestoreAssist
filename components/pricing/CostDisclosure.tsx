"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";
import { RAIcon } from "@/components/brand/RAIcon";
import {
  fadeUp,
  staggerContainer,
  VIEWPORT,
  CONTAINER,
  FONT_DISPLAY,
  SECTION_PAD,
  SECTION_EYEBROW,
  SURFACE,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

/**
 * Full cost disclosure for the public pricing page.
 *
 * More than one party charges a contractor who runs Restore Assist, and this
 * component names every one of them in one place:
 *
 *   1. Restore Assist, plan and report packs — itemised from PRICING_CONFIG
 *      (lib/pricing.ts) so the page can never drift from the catalogue the
 *      checkout actually sells from. The effective per-report rate is derived
 *      by division from those same authored numbers.
 *
 *   2. Restore Assist, recurring add-ons — itemised from RECURRING_ADDONS
 *      (lib/billing/addon-registry.ts), the same registry
 *      app/api/addons/checkout/route.ts prices the Stripe subscription from.
 *      Every descriptor is rendered; nothing is filtered and no price is
 *      restated locally, so a new add-on registered there appears here with no
 *      edit to this file. Until this block existed these seven charges were
 *      discoverable only AFTER signup, at app/dashboard/addons/page.tsx behind
 *      BillingGate, while this page called itself "the complete price list"
 *      and denied there was any per-seat fee. Both statements were false: the
 *      registry ships a per-seat Field Technician Seat charge.
 *
 *   3. The customer's AI provider — report generation runs on the customer's
 *      own Anthropic or OpenAI key, billed directly by that provider.
 *
 * DELIBERATELY UNQUANTIFIED: the per-report AI cost. There is no authored
 * figure for it anywhere in this repository. The main report-generation route
 * (app/api/reports/generate-inspection-report/route.ts) caps output at 16,000
 * tokens but bounds neither input tokens nor the model the customer selects,
 * and it does not run through the per-call cost cap in lib/ai/task-policy.ts.
 * A per-report dollar amount therefore cannot be computed from anything this
 * codebase actually enforces. Rather than print a number we cannot stand
 * behind, this component states what the cost is, who is paid, that Restore
 * Assist takes no share of it, and where the buyer can read the current rates
 * for themselves. Do not add an estimate here without a real, cited source.
 */

type CostRow = {
  key: string;
  label: string;
  amount: string;
  cadence: string;
  included: string;
  perReport: string;
};

/** Match the plan cards: whole dollars stay whole, cents get two places. */
function formatAud(amount: number): string {
  return amount % 1 === 0 ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Effective software cost per report — plain division of authored figures. */
function perReportRate(amount: number, reports: number): string {
  if (reports <= 0) return "Not applicable";
  return `$${(amount / reports).toFixed(2)}`;
}

/**
 * Every recurring add-on the checkout can sell, in registry order. Read from
 * lib/billing/addon-registry.ts — the same object app/api/addons/checkout and
 * the Stripe webhook read — so no price, name or interval is authored here.
 */
const ADDON_ROWS = Object.values(RECURRING_ADDONS);

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The entrance animation is an ENHANCEMENT, never a precondition for reading
 * this page.
 *
 * framer-motion resolves `initial="hidden"` during server rendering, so a
 * section written that way ships as `style="opacity:0;transform:translateY(16px)"`
 * — invisible until a `whileInView` reveal runs. With JavaScript blocked, slow
 * or failed, the page's content never appears at all. For a page whose whole
 * job is disclosing what a buyer pays, that is not an acceptable failure mode.
 *
 * So the server render, and the first client render that must hydrate against
 * it, pass `initial={false}`: framer-motion emits no initial state and the
 * markup arrives visible. The reveal is armed only once the client has
 * hydrated. Arming changes the subtree `key`, which re-mounts it with the
 * hidden initial state; because that happens in a LAYOUT effect it commits
 * before the browser paints, so users who do get JavaScript still see the full
 * animation and no flash.
 */
function useRevealArmed(): boolean {
  const [armed, setArmed] = useState(false);
  useIsomorphicLayoutEffect(() => setArmed(true), []);
  return armed;
}

export interface CostDisclosureProps {
  className?: string;
}

export function CostDisclosure({ className }: CostDisclosureProps) {
  const reduce = useLandingReduceMotion();
  const armed = useRevealArmed();

  const free = PRICING_CONFIG.free;
  const monthly = PRICING_CONFIG.pricing.monthly;

  const rows: CostRow[] = [
    {
      key: "free",
      label: free.displayName,
      amount: formatAud(free.amount),
      cadence: `once, for ${free.trialDays} days`,
      included: `${free.trialReportCredits} report credits and ${free.trialQuickFillCredits} Quick Fill credits`,
      perReport: perReportRate(free.amount, free.trialReportCredits),
    },
    {
      key: "monthly",
      label: monthly.displayName,
      amount: formatAud(monthly.amount),
      cadence: `per ${monthly.interval}`,
      included: `${monthly.reportLimit} inspection reports per ${monthly.interval}, plus ${monthly.signupBonus} bonus reports in your first ${monthly.interval}`,
      perReport: perReportRate(monthly.amount, monthly.reportLimit),
    },
    ...Object.values(PRICING_CONFIG.addons).map((addon) => ({
      key: addon.name,
      label: addon.displayName,
      amount: formatAud(addon.amount),
      cadence: "per pack, when you buy one",
      included: `${addon.reportLimit} additional reports`,
      perReport: perReportRate(addon.amount, addon.reportLimit),
    })),
  ];

  return (
    <section
      className={`bg-[#F3F5F7] border-t border-slate-200/90 ${SECTION_PAD} ${className ?? ""}`}
    >
      <div className={CONTAINER}>
        <motion.div
          key={armed ? "reveal-armed" : "reveal-static"}
          variants={staggerContainer}
          initial={armed && !reduce ? "hidden" : false}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mx-auto max-w-4xl"
        >
          <motion.div variants={fadeUp} className="max-w-2xl">
            <p className={SECTION_EYEBROW}>Cost disclosure</p>
            <h2
              className={`${FONT_DISPLAY} mt-4 text-3xl font-semibold tracking-tight text-[#0B1F3A] sm:text-4xl`}
            >
              Everything you pay to run Restore Assist
            </h2>
            {/*
              This read "Two parties charge you. We are one of them." A critic
              checked it against the add-on table directly below and it is
              wrong: ElevenLabs Voice needs the customer's own ElevenLabs key,
              the Bookkeeping add-on needs their Xero / QuickBooks / MYOB
              account, and the Service CRM add-on needs Ascora or DR-NRPG. Each
              is a further party billing them directly. "Two" was true only for
              a buyer who switches none of those on.

              Worth naming precisely because this section invites the reader to
              report a missing cost — a page that asks to be held to
              completeness has to be right about how many parties are involved.
            */}
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              We are not the only party that charges you. Everything we bill is
              below, along with the costs we do not bill — your AI provider on
              every plan, and the third-party accounts some add-ons connect to.
            </p>
          </motion.div>

          {/* 1 — What Restore Assist bills. */}
          <motion.div variants={fadeUp} className={`${SURFACE} mt-10 p-7 sm:p-8`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="invoice" size={20} decorative />
              </span>
              <div>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-tight text-[#0B1F3A]`}
                >
                  1. Billed by Restore Assist — plan and report packs
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  The subscription and the report top-up packs. There is no
                  setup fee and no charge to export your own reports. The
                  optional add-ons are separate recurring charges and are
                  listed in full below, not buried behind signup.
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Restore Assist subscription and add-on charges, with the
                  effective software cost per inspection report.
                </caption>
                <thead>
                  <tr className="border-b border-slate-200">
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      Charge
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      What it covers
                    </th>
                    <th
                      scope="col"
                      className="py-3 text-right font-semibold text-[#0B1F3A]"
                    >
                      Software per report
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-slate-200/70 align-top"
                    >
                      <th
                        scope="row"
                        className="py-4 pr-4 font-medium text-[#0B1F3A]"
                      >
                        {row.label}
                      </th>
                      <td className="py-4 pr-4 text-slate-600">
                        <span className="font-semibold text-[#0B1F3A]">
                          {row.amount}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {row.cadence}
                        </span>
                      </td>
                      <td className="py-4 pr-4 leading-relaxed text-slate-600">
                        {row.included}
                      </td>
                      <td className="py-4 text-right font-semibold text-[#0B1F3A]">
                        {row.perReport}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Amounts in {monthly.currency}. Plan pricing includes GST and tax
              invoices are issued monthly. The per-report column is the plan or
              pack price divided by the reports it covers, and it is the
              Restore Assist software cost only — the AI generation cost in
              section 3 sits on top of it and is not included in that figure.
              Cancel any time.
            </p>
          </motion.div>

          {/* 2 — The recurring add-ons. Every descriptor the checkout can sell,
              rendered from lib/billing/addon-registry.ts. Do NOT filter this
              list or restate a price: the whole point of the block is that the
              page cannot quietly omit a charge the buyer will be billed. */}
          <motion.div variants={fadeUp} className={`${SURFACE} mt-6 p-7 sm:p-8`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="task" size={20} decorative />
              </span>
              <div>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-tight text-[#0B1F3A]`}
                >
                  2. Billed by Restore Assist — optional add-ons
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  None of these is required to run the product, and none is
                  included in the plan above. Each is a separate recurring
                  subscription you switch on yourself, and each can be
                  cancelled on its own. All {ADDON_ROWS.length} are listed
                  here.
                </p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Every optional recurring Restore Assist add-on, with its
                  price and billing interval.
                </caption>
                <thead>
                  <tr className="border-b border-slate-200">
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      Add-on
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-4 font-semibold text-[#0B1F3A]"
                    >
                      What it covers
                    </th>
                    <th
                      scope="col"
                      className="py-3 text-right font-semibold text-[#0B1F3A]"
                    >
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ADDON_ROWS.map((addon) => (
                    <tr
                      key={addon.sku}
                      className="border-b border-slate-200/70 align-top"
                    >
                      <th
                        scope="row"
                        className="py-4 pr-4 font-medium text-[#0B1F3A]"
                      >
                        {addon.name}
                      </th>
                      <td className="py-4 pr-4 leading-relaxed text-slate-600">
                        {addon.description}
                      </td>
                      <td className="py-4 text-right text-slate-600">
                        <span className="font-semibold text-[#0B1F3A]">
                          {formatAud(addon.amount)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          per {addon.interval}
                          {addon.perSeat ? ", per seat" : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Amounts in {ADDON_ROWS[0]?.currency ?? monthly.currency},
              GST-inclusive, each billed as its own subscription alongside the
              plan. A per-seat add-on is charged once for every seat you buy,
              so its monthly cost is the amount above multiplied by your seat
              count.
            </p>
          </motion.div>

          {/* 3 — What the AI provider bills. The honest gap. */}
          <motion.div variants={fadeUp} className={`${SURFACE} mt-6 p-7 sm:p-8`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-[#3B6D8C]">
                <RAIcon name="ai" size={20} decorative />
              </span>
              <div>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-tight text-[#0B1F3A]`}
                >
                  3. Billed by your AI provider, not by us
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Report generation on every plan, including the{" "}
                  {free.trialDays}-day free trial, runs on your own Anthropic or
                  OpenAI API key. That is a real out-of-pocket cost of using
                  this product, so it belongs on this page.
                </p>
              </div>
            </div>

            <dl className="mt-6 space-y-5 border-t border-slate-200/70 pt-6">
              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  Who charges you
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  Anthropic or OpenAI bill your account directly, on their own
                  published token rates. The payment never passes through us.
                </dd>
              </div>

              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  Our margin on it
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  None. Restore Assist adds no markup and takes no share. It is
                  why the subscription above is priced as it is.
                </dd>
              </div>

              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  The amount
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  We do not publish a per-report figure, because we cannot give
                  you an honest one. It moves with the model you select and the
                  size of the report you generate, and we would rather name the
                  cost and leave it open than quote an average that turns out to
                  be wrong on your jobs. Read the current rates at{" "}
                  <a
                    href="https://www.anthropic.com/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#3B6D8C] underline underline-offset-2 hover:text-[#0B1F3A]"
                  >
                    anthropic.com/pricing
                  </a>{" "}
                  and{" "}
                  <a
                    href="https://openai.com/api/pricing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#3B6D8C] underline underline-offset-2 hover:text-[#0B1F3A]"
                  >
                    openai.com/api/pricing
                  </a>
                  . Your provider console shows exactly what you have spent.
                </dd>
              </div>

              <div className="sm:flex sm:gap-6">
                <dt className="text-sm font-semibold text-[#0B1F3A] sm:w-44 sm:shrink-0">
                  What you control
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600 sm:mt-0">
                  You choose the provider and model under Settings, then AI
                  Providers, and you can revoke the key at any time. Usage stops
                  when you stop generating reports.
                </dd>
              </div>
            </dl>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="mt-6 text-center text-xs leading-relaxed text-slate-500"
          >
            If a cost is missing from this page, that is a fault we want to
            hear about, not a detail we left out on purpose.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

export default CostDisclosure;
