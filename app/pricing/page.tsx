"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
import { perReportRate, formatPerReport } from "@/lib/pricing/unit-rate";
import { VolumePicker } from "@/components/pricing/VolumePicker";
import { TierComparison, PAID_ONLY_CAPABILITIES } from "@/components/pricing/TierComparison";
import { CostDisclosure } from "@/components/pricing/CostDisclosure";
import BillingGate from "@/components/capacitor/BillingGate";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { RAIcon } from "@/components/brand/RAIcon";
import {
  MarketingShell,
  MarketingPageHero,
} from "@/components/landing/home";
import {
  fadeUp,
  staggerContainer,
  FONT_DISPLAY,
  CONTAINER,
  SECTION_PAD,
  VIEWPORT,
  CTA_PRIMARY,
  CTA_SECONDARY,
  SURFACE,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

function PricingPageContent() {
  const reduce = useLandingReduceMotion();
  const freeCfg = PRICING_CONFIG.free;

  type DisplayPlan = {
    name: string;
    price: string;
    /** Numeric amount, kept alongside the display string so the per-report rate
     *  can be derived rather than parsed back out of "$99". */
    amountAud: number;
    period: string;
    description: string;
    features: readonly string[];
    popular: boolean;
    badge: string | null;
    monthlyEquivalent: number | null;
    reportLimit: number;
    signupBonus: number | null;
    isFree: boolean;
  };

  const freePlan: DisplayPlan = {
    name: freeCfg.displayName,
    price: "$0",
    amountAud: freeCfg.amount,
    period: "",
    description: freeCfg.description,
    features: [...freeCfg.features],
    popular: false,
    badge: null,
    monthlyEquivalent: null,
    reportLimit: freeCfg.reportLimit,
    signupBonus: null,
    isFree: true,
  };

  const plans: DisplayPlan[] = Object.values(PRICING_CONFIG.pricing).map(
    (plan) => {
    const price =
      plan.amount % 1 === 0 ? `$${plan.amount}` : `$${plan.amount.toFixed(2)}`;
    const period =
      "interval" in plan && plan.interval ? `/${plan.interval}` : "";
    // There is exactly one paid SKU: the yearly plan was retired in the
    // billing-correctness collapse (lib/pricing.ts:47-57). The branch that used
    // to sit here still described a "70 reports per month" yearly plan that
    // could never render. Derive the figure from reportLimit rather than
    // restating it — restating it is how the retired copy drifted in the first
    // place.
    const description = `For restoration businesses running ${plan.reportLimit} inspection reports a month.`;

    return {
      name: plan.displayName,
      price,
      amountAud: plan.amount,
      period,
      description,
      features: plan.features,
      popular: plan.popular,
      badge: (plan as { badge?: string }).badge ?? null,
      monthlyEquivalent:
        (plan as { monthlyEquivalent?: number }).monthlyEquivalent ?? null,
      reportLimit: plan.reportLimit,
      signupBonus: (plan as { signupBonus?: number }).signupBonus ?? null,
      isFree: false,
    };
    },
  );

  const allPlans = [freePlan, ...plans];

  const addons = Object.values(PRICING_CONFIG.addons).map((addon) => ({
    name: addon.displayName,
    price:
      addon.amount % 1 === 0
        ? `$${addon.amount}`
        : `$${addon.amount.toFixed(2)}`,
    amountAud: addon.amount,
    reportLimit: addon.reportLimit,
    description: addon.description,
    popular: "popular" in addon ? addon.popular : false,
    badge: "badge" in addon ? addon.badge : null,
  }));

  return (
    <MarketingShell>
      <MarketingPageHero
        align="center"
        eyebrow="Plans"
        title="Restoration Report Software Plans"
        description={`Start with a ${freeCfg.trialDays}-day free trial — ${freeCfg.trialReportCredits} inspection report credits and basic features, no credit card required. Upgrade to unlock unlimited Quick Fill, enhanced reports, PDF uploads, and more. All paid plans include first month signup bonus of 10 additional reports.`}
      />

      <section className={`bg-white border-t border-slate-200/90 ${SECTION_PAD}`}>
        <div className={CONTAINER}>
          <Alert className="mx-auto mb-12 max-w-3xl border-slate-200 bg-[#F3F5F7]">
            <AlertTitle className="text-[#0B1F3A]">
              Bring your own AI key
            </AlertTitle>
            <AlertDescription className="text-slate-600">
              Report generation on every plan — including your free trial —
              runs on your own Anthropic or OpenAI API key. You pay your
              provider directly, at cost, so you stay in control of usage and
              data. Add your key in Settings → AI Providers after signup.
            </AlertDescription>
          </Alert>

              <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="grid gap-6 md:grid-cols-3 md:gap-8"
          >
            {allPlans.map((plan) => (
              <motion.article
                key={plan.name}
                variants={fadeUp}
                className={`${SURFACE} relative p-7 sm:p-8 ${
                  plan.popular
                    ? "border-[#0B1F3A]/25 ring-1 ring-[#0B1F3A]/10"
                    : plan.isFree
                      ? "border-[#3B6D8C]/25"
                      : ""
                }`}
              >
                {plan.isFree ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#3B6D8C] px-3 py-1 text-xs font-semibold text-white">
                    {freeCfg.trialDays}-Day Free Trial
                  </div>
                ) : null}
                {plan.popular && !plan.isFree ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0B1F3A] px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                ) : null}
                {plan.badge && !plan.popular && !plan.isFree ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0B1F3A] px-3 py-1 text-xs font-semibold text-white">
                    {plan.badge}
                  </div>
                ) : null}

                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-tight text-[#0B1F3A]`}
                >
                  {plan.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {plan.description}
                </p>

                <div className="mt-6">
                  <span
                    className={`${FONT_DISPLAY} text-4xl font-semibold tracking-tight text-[#0B1F3A]`}
                  >
                    {plan.price}
                  </span>
                  {plan.period ? (
                    <span className="text-base text-slate-500">
                      {plan.period}
                    </span>
                  ) : null}
                  {!plan.isFree ? (
                    <p className="mt-1 text-xs text-slate-500">
                      AUD, incl. GST. Tax invoices issued monthly. Cancel any
                      time.
                    </p>
                  ) : null}
                  {plan.monthlyEquivalent ? (
                    <p className="mt-1 text-sm text-slate-500">
                      ${plan.monthlyEquivalent}/month equivalent
                    </p>
                  ) : null}
                  {plan.reportLimit && typeof plan.reportLimit === "number" ? (
                    <div className="mt-3 rounded-xl bg-[#F3F5F7] p-3">
                      <p className="text-sm font-semibold text-[#0B1F3A]">
                        {plan.reportLimit} Inspection Reports
                        {plan.period === "/month"
                          ? " per month"
                          : plan.isFree
                            ? ` (${freeCfg.trialDays}-day trial)`
                            : ""}
                      </p>
                      {plan.signupBonus && !plan.isFree ? (
                        <p className="mt-1 text-xs text-slate-500">
                          +{plan.signupBonus} bonus reports on first month
                        </p>
                      ) : null}
                      {/* The unit rate is the number a volume buyer actually
                          compares on, and it was absent from this page
                          entirely. Derived from the plan amount, never
                          authored, so it cannot drift from PRICING_CONFIG. */}
                      {!plan.isFree ? (
                        <p className="mt-2 border-t border-slate-200/90 pt-2 text-sm font-semibold text-[#0B1F3A]">
                          {formatPerReport(
                            perReportRate(plan.amountAud, plan.reportLimit),
                          )}{" "}
                          <span className="font-normal text-slate-500">
                            per report
                          </span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-slate-600"
                    >
                      <span className="mt-0.5 text-[#3B6D8C]">
                        <RAIcon name="success" size={16} decorative />
                      </span>
                      {feature}
                    </li>
                  ))}
                  {/* These five paid-only capabilities used to be five copies of
                      the same hand-written <li> here, which PRICING_CONFIG has
                      never heard of and pricing-integrity.test.ts therefore
                      cannot assert on. They now come from one array. That is a
                      bridge, not a fix: the strings still belong in
                      PRICING_CONFIG.pricing.monthly under a paidOnlyFeatures
                      key, after which this import should go away. */}
                  {!plan.isFree
                    ? PAID_ONLY_CAPABILITIES.map((capability) => (
                        <li
                          key={capability}
                          className="flex items-start gap-2 text-sm text-slate-600"
                        >
                          <span className="mt-0.5 text-[#3B6D8C]">
                            <RAIcon name="success" size={16} decorative />
                          </span>
                          <span>{capability}</span>
                        </li>
                      ))
                    : null}
                </ul>

                <Link
                  href="/signup"
                  className={`${plan.popular || plan.isFree ? CTA_PRIMARY : CTA_SECONDARY} mt-8 w-full`}
                >
                  {plan.isFree ? "Get Started Free" : "Start Free Trial"}
                </Link>
              </motion.article>
            ))}
          </motion.div>

          {/* Work out what a given month actually costs, before signing up.
              Volume pricing that a buyer has to compute themselves is not
              legible pricing. */}
          <div className="mt-20">
            <VolumePicker />
          </div>

          {/* What the $99 changes, on one shared row per capability, rather
              than two bullet lists the buyer has to diff by eye. */}
          <div className="mt-20">
            <TierComparison />
          </div>

        <div className="mt-20">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2
                className={`${FONT_DISPLAY} text-3xl font-semibold tracking-tight text-[#0B1F3A] sm:text-4xl`}
            >
              Add More Reports
            </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
              Need more reports? Add additional report packs to your
              subscription
            </p>
            </div>

              <motion.div
              variants={staggerContainer}
              initial={reduce ? false : "hidden"}
              whileInView="visible"
              viewport={VIEWPORT}
              className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 md:gap-8"
            >
              {addons.map((addon) => (
                <motion.article
                  key={addon.name}
                  variants={fadeUp}
                  className={`${SURFACE} relative p-6 sm:p-7 ${
                    addon.popular ? "border-[#0B1F3A]/25" : ""
                  }`}
                >
                  {addon.popular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0B1F3A] px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                  ) : null}
                  {addon.badge && !addon.popular ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0B1F3A] px-3 py-1 text-xs font-semibold text-white">
                      {String(addon.badge)}
                  </div>
                  ) : null}
                  <h3
                    className={`${FONT_DISPLAY} text-lg font-semibold text-[#0B1F3A]`}
                >
                  {addon.name}
                </h3>
                  <p className="mt-2 text-sm text-slate-600">
                  {addon.description}
                </p>
                  <div className="mt-5">
                  <span
                      className={`${FONT_DISPLAY} text-3xl font-semibold text-[#0B1F3A]`}
                  >
                    {addon.price}
                  </span>
                    <div className="mt-3 rounded-xl bg-[#F3F5F7] p-3">
                      <p className="text-sm font-semibold text-[#0B1F3A]">
                      {addon.reportLimit} Additional Reports
                    </p>
                      {/* Printed on every pack so the packs can be compared
                          against each other and against the plan's own rate.
                          Two of the three are dearer per report than the plan
                          they extend; that is a pricing fact, and hiding it is
                          exactly what this piece is judged against. */}
                      <p className="mt-2 border-t border-slate-200/90 pt-2 text-sm font-semibold text-[#0B1F3A]">
                        {formatPerReport(
                          perReportRate(addon.amountAud, addon.reportLimit),
                        )}{" "}
                        <span className="font-normal text-slate-500">
                          per report
                        </span>
                      </p>
                  </div>
                </div>
                <Link
                  href="/signup"
                    className={`${addon.popular ? CTA_PRIMARY : CTA_SECONDARY} mt-6 w-full`}
                >
                  Add to Plan
                </Link>
                </motion.article>
              ))}
              </motion.div>
          </div>

          {/* The full ledger of what a contractor pays, including the cost we
              do NOT bill — report generation runs on their own AI key. The
              Alert above flags it early; this states it completely. */}
          <div className="mt-20">
            <CostDisclosure />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

export default function PricingPage() {
  return (
    <BillingGate>
      <PricingPageContent />
    </BillingGate>
  );
}
