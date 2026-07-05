"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import Footer from "@/components/landing/Footer";
import { PRICING_CONFIG } from "@/lib/pricing";
import BillingGate from "@/components/capacitor/BillingGate";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

function PricingPageContent() {
  const [darkMode] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!document.getElementById("google-fonts-preconnect")) {
      const link1 = document.createElement("link");
      link1.id = "google-fonts-preconnect";
      link1.rel = "preconnect";
      link1.href = "https://fonts.googleapis.com";
      document.head.appendChild(link1);

      const link2 = document.createElement("link");
      link2.rel = "preconnect";
      link2.href = "https://fonts.gstatic.com";
      link2.crossOrigin = "anonymous";
      document.head.appendChild(link2);

      const link3 = document.createElement("link");
      link3.href =
        "https://fonts.googleapis.com/css2?family=Open+Sauce+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap";
      link3.rel = "stylesheet";
      document.head.appendChild(link3);
    }
  }, []);

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

  // Map pricing config to display format
  const plans: DisplayPlan[] = Object.values(PRICING_CONFIG.pricing).map((plan) => {
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
      // The single $99 catalog has no badge / monthlyEquivalent (those were
      // yearly-only); type the optional accessors explicitly so the collapse
      // to one SKU keeps these display fields as string|null / number|null.
      badge: (plan as { badge?: string }).badge ?? null,
      monthlyEquivalent:
        (plan as { monthlyEquivalent?: number }).monthlyEquivalent ?? null,
      reportLimit: plan.reportLimit,
      signupBonus: (plan as { signupBonus?: number }).signupBonus ?? null,
      isFree: false,
    };
  });

  // Combine free plan with paid plans
  const allPlans = [freePlan, ...plans];

  // Map addons config to display format
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
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      {/* Header - Hamburger menu always visible, even on desktop */}
      <header className="fixed top-0 w-full z-[100] bg-brand-navy/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
          {/* Logo - Left Side */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              {/* White circular logo */}
              <div className=" flex items-center justify-center relative overflow-hidden">
                <Image
                  src="/logo.png"
                  alt="Restore Assist Logo"
                  width={100}
                  height={100}
                  className="object-contain p-1 md:p-2"
                />
              </div>
            </Link>
          </div>

          {/* Hamburger Menu - Right Side, Bigger Size, Always Visible */}
          <button
            className="text-white hover:text-slate-300 transition-colors p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X size={32} className="w-8 h-8" />
            ) : (
              <Menu size={32} className="w-8 h-8" />
            )}
          </button>
        </div>
      </header>

      {/* Overlay when menu is open - Behind menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Sidebar Menu - Slides in from right */}
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{
                duration: 0.35,
                ease: [0.32, 0.72, 0, 1],
                opacity: { duration: 0.2 },
              }}
              className="fixed top-0 right-0 h-screen w-80 max-w-[85vw] bg-brand-navy border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[160] overflow-hidden flex flex-col"
            >
              {/* Menu Header - Fixed at top */}
              <div className="flex-shrink-0 bg-brand-navy border-b border-white/10 px-6 py-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white uppercase tracking-wider">
                  Menu
                </h2>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-white hover:text-slate-300 transition-colors p-2.5 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10"
                  aria-label="Close menu"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Menu Content - Scrollable */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                  <nav className="space-y-1">
                    <Link
                      href="/features"
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Features
                    </Link>
                    <Link
                      href="/solutions"
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Solutions
                    </Link>
                    <Link
                      href="/pricing"
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Pricing
                    </Link>
                    <Link
                      href="/resources"
                      className="block px-4 py-3 text-base font-medium text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Resources
                    </Link>
                  </nav>

                  {/* Action Buttons */}
                  <div className="pt-6 mt-6 border-t border-white/10 space-y-3">
                    <Link
                      href="/pricing"
                      className="block w-full px-6 py-3 bg-brand-steel text-white rounded-lg text-center font-medium hover:bg-brand-steel-hover transition-all duration-200 shadow-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Pricing
                    </Link>
                    <Link
                      href="/login"
                      className="block w-full px-6 py-3 bg-brand-cta text-white rounded-lg text-center font-medium hover:bg-brand-cta-hover transition-all duration-200 shadow-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log In
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-brand-mist/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
            style={{
              fontFamily:
                '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Restoration Report Software Plans
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
            style={{
              fontFamily:
                '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Start with a {freeCfg.trialDays}-day free trial —{" "}
            {freeCfg.trialReportCredits} inspection report credits and basic
            features, no credit card required. Upgrade to unlock unlimited Quick
            Fill, enhanced reports, PDF uploads, and more. All paid plans
            include first month signup bonus of 10 additional reports.
          </motion.p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-brand-bronze/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-brand-bronze/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          {/* RA-6933 — BYOK disclosure. Report generation (all plans, including
              the free trial) runs on the customer's own Anthropic or OpenAI key
              (RA-6932 removed the platform-key fallback), so this must sit
              before the plan cards rather than buried in fine print. Wording
              mirrors the signup page's "What you'll need after signup" card
              so the promise is identical everywhere it's made. */}
          <Alert className="max-w-3xl mx-auto mb-12 bg-brand-navy/60 border-brand-bronze/40">
            <AlertTitle className="text-brand-cloud">
              Bring your own AI key
            </AlertTitle>
            <AlertDescription className="text-brand-mist">
              Report generation on every plan — including your free trial —
              runs on your own Anthropic or OpenAI API key. You pay your
              provider directly, at cost, so you stay in control of usage and
              data. Add your key in Settings → AI Providers after signup.
            </AlertDescription>
          </Alert>
          <div className="grid md:grid-cols-3 gap-8">
            {allPlans.map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-8 rounded-lg relative ${plan.popular ? "border-2 border-brand-bronze" : plan.isFree ? "border-2 border-brand-slate" : ""} ${darkMode ? "bg-brand-navy/50 border-brand-slate/30" : "bg-brand-cloud/50 border-brand-slate/20"} backdrop-blur-sm border`}
              >
                {plan.isFree && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-steel text-brand-cloud rounded-full text-sm font-medium"
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {freeCfg.trialDays}-Day Free Trial
                  </div>
                )}
                {plan.popular && !plan.isFree && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-cta text-brand-cloud rounded-full text-sm font-medium"
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    Most Popular
                  </div>
                )}
                {plan.badge && !plan.popular && !plan.isFree && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-cta text-brand-cloud rounded-full text-sm font-medium"
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {plan.badge}
                  </div>
                )}
                <h3
                  className={`text-2xl font-bold mb-2 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {plan.name}
                </h3>
                <p
                  className={`text-sm mb-6 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {plan.description}
                </p>
                <div className="mb-6">
                  <span
                    className={`text-4xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                    style={{
                      fontFamily:
                        '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      className={`text-lg ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                      style={{
                        fontFamily:
                          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      }}
                    >
                      {plan.period}
                    </span>
                  )}
                  {/* RA-1580 — AU B2B requires explicit AUD + GST-inclusive
                      labelling; pair with Tax Invoice promise from RA-1559. */}
                  {!plan.isFree && (
                    <p
                      className={`text-xs mt-1 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                    >
                      AUD, incl. GST. Tax invoices issued monthly. Cancel any
                      time.
                    </p>
                  )}
                  {plan.monthlyEquivalent && (
                    <p
                      className={`text-sm mt-1 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                      style={{
                        fontFamily:
                          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      }}
                    >
                      ${plan.monthlyEquivalent}/month equivalent
                    </p>
                  )}
                  {plan.reportLimit && typeof plan.reportLimit === "number" && (
                    <div
                      className={`mt-2 p-3 rounded-lg ${plan.isFree ? (darkMode ? "bg-brand-slate/20" : "bg-brand-slate/10") : darkMode ? "bg-brand-bronze/20" : "bg-brand-bronze/10"}`}
                    >
                      <p
                        className={`text-sm font-semibold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                      >
                        {plan.reportLimit} Inspection Reports
                        {plan.period === "/month"
                          ? " per month"
                          : plan.isFree
                            ? ` (${freeCfg.trialDays}-day trial)`
                            : ""}
                      </p>
                      {plan.signupBonus && !plan.isFree && (
                        <p
                          className={`text-xs mt-1 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        >
                          +{plan.signupBonus} bonus reports on first month
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className={`flex items-start gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                      style={{
                        fontFamily:
                          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      }}
                    >
                      <span
                        className={`mt-1 ${plan.isFree ? "text-brand-slate" : "text-brand-bronze"}`}
                      >
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                  {!plan.isFree && (
                    <>
                      <li
                        className={`flex items-start gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        <span className="text-brand-bronze mt-1">✓</span>
                        <span>
                          Unlimited Quick Fill (AI-powered form auto-fill)
                        </span>
                      </li>
                      <li
                        className={`flex items-start gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        <span className="text-brand-bronze mt-1">✓</span>
                        <span>Enhanced & Optimised report types</span>
                      </li>
                      <li
                        className={`flex items-start gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        <span className="text-brand-bronze mt-1">✓</span>
                        <span>PDF upload & processing</span>
                      </li>
                      <li
                        className={`flex items-start gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        <span className="text-brand-bronze mt-1">✓</span>
                        <span>Full profile & pricing configuration</span>
                      </li>
                      <li
                        className={`flex items-start gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                        style={{
                          fontFamily:
                            '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        }}
                      >
                        <span className="text-brand-bronze mt-1">✓</span>
                        <span>
                          Premium API integrations (Claude, GPT, etc.)
                        </span>
                      </li>
                    </>
                  )}
                </ul>
                <Link
                  href="/signup"
                  className={`block w-full px-6 py-3 rounded-lg text-center font-medium transition-colors ${plan.isFree ? "bg-brand-steel text-brand-cloud hover:bg-brand-steel-hover" : plan.popular ? "bg-brand-cta text-brand-cloud hover:bg-brand-cta-hover" : "bg-brand-steel text-brand-cloud hover:bg-brand-steel-hover"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {plan.isFree ? "Get Started Free" : "Start Free Trial"}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Add-ons Section */}
        <div className="mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2
              className={`text-3xl md:text-4xl font-bold mb-4 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
              style={{
                fontFamily:
                  '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              Add More Reports
            </h2>
            <p
              className={`text-lg ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
              style={{
                fontFamily:
                  '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              Need more reports? Add additional report packs to your
              subscription
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {addons.map((addon, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-6 rounded-lg relative ${addon.popular ? "border-2 border-brand-bronze" : ""} ${darkMode ? "bg-brand-navy/50 border-brand-slate/30" : "bg-brand-cloud/50 border-brand-slate/20"} backdrop-blur-sm border`}
              >
                {addon.popular && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-cta text-brand-cloud rounded-full text-sm font-medium"
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    Most Popular
                  </div>
                )}
                {addon.badge && !addon.popular && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-brand-cta text-brand-cloud rounded-full text-sm font-medium"
                    style={{
                      fontFamily:
                        '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {addon.badge}
                  </div>
                )}
                <h3
                  className={`text-xl font-bold mb-2 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {addon.name}
                </h3>
                <p
                  className={`text-sm mb-4 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {addon.description}
                </p>
                <div className="mb-6">
                  <span
                    className={`text-3xl font-bold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                    style={{
                      fontFamily:
                        '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    {addon.price}
                  </span>
                  <div
                    className={`mt-2 p-3 rounded-lg ${darkMode ? "bg-brand-bronze/20" : "bg-brand-bronze/10"}`}
                  >
                    <p
                      className={`text-sm font-semibold ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                    >
                      {addon.reportLimit} Additional Reports
                    </p>
                  </div>
                </div>
                <Link
                  href="/signup"
                  className={`block w-full px-6 py-3 rounded-lg text-center font-medium transition-colors ${addon.popular ? "bg-brand-cta text-brand-cloud hover:bg-brand-cta-hover" : "bg-brand-steel text-brand-cloud hover:bg-brand-steel-hover"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  Add to Plan
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  );
}

export default function PricingPage() {
  return (
    <BillingGate>
      <PricingPageContent />
    </BillingGate>
  );
}
