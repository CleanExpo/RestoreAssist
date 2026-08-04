"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
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
    const description =
      plan.name === "Monthly Plan"
        ? "Perfect for growing restoration businesses with 50 reports per month."
        : "Best value with 70 reports per month for long-term commitment.";

    return {
      name: plan.displayName,
      price,
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
                  {!plan.isFree ? (
                    <>
                      <li className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="mt-0.5 text-[#3B6D8C]">
                          <RAIcon name="success" size={16} decorative />
                        </span>
                        <span>
                          Unlimited Quick Fill (AI-powered form auto-fill)
                        </span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="mt-0.5 text-[#3B6D8C]">
                          <RAIcon name="success" size={16} decorative />
                        </span>
                        <span>Enhanced & Optimised report types</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="mt-0.5 text-[#3B6D8C]">
                          <RAIcon name="success" size={16} decorative />
                        </span>
                        <span>PDF upload & processing</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="mt-0.5 text-[#3B6D8C]">
                          <RAIcon name="success" size={16} decorative />
                        </span>
                        <span>Full profile & pricing configuration</span>
                      </li>
                      <li className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="mt-0.5 text-[#3B6D8C]">
                          <RAIcon name="success" size={16} decorative />
                        </span>
                        <span>
                          Premium API integrations (Claude, GPT, etc.)
                        </span>
                      </li>
                    </>
                  ) : null}
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
