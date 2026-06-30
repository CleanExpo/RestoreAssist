"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import { Menu, X } from "lucide-react";
import MobileWorkflowCarousel from "@/components/landing/MobileWorkflowCarousel";
import { AvatarOrb } from "@/components/avatar";

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    // Load fonts dynamically if not already loaded
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
        "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";
      link3.rel = "stylesheet";
      document.head.appendChild(link3);
    }
  }, []);

  return (
    <div className="min-h-screen bg-brand-navy text-white">
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
                  priority
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

      {/* Overlay when menu is open - CSS-based (no Framer Motion) */}
      {/* Backdrop Overlay */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] transition-opacity duration-[250ms] ${
          mobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar Menu - CSS slide in from right */}
      <div
        className={`fixed top-0 right-0 h-screen w-80 max-w-[85vw] bg-brand-navy border-l border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[160] overflow-hidden flex flex-col ${
          mobileMenuOpen
            ? "translate-x-0 pointer-events-auto"
            : "translate-x-full pointer-events-none"
        }`}
        style={{ transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)" }}
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
                href="/signup"
                className="block w-full px-6 py-3 bg-brand-cta text-white rounded-lg text-center font-medium hover:bg-brand-cta-hover transition-all duration-200 shadow-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Started
              </Link>
              <Link
                href="/login"
                className="block w-full px-6 py-3 bg-brand-steel text-white rounded-lg text-center font-medium hover:bg-brand-steel-hover transition-all duration-200 shadow-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-start overflow-hidden pt-20 bg-brand-mist/30">
        {/* Golden Gradient Background Behind Section */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-full">
            <div className="w-full h-full bg-gradient-to-r from-brand-bronze/25 via-brand-gold/15 to-transparent blur-3xl"></div>
          </div>
        </div>

        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-brand-bronze/22 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-[450px] h-[450px] bg-brand-bronze/20 rounded-full blur-3xl"></div>
          <svg
            aria-hidden="true"
            className="absolute top-1/3 right-1/4 w-96 h-96 opacity-20"
            viewBox="0 0 200 200"
          >
            <polygon
              points="100,20 180,60 160,140 40,140 20,60"
              fill="#8A6B4E"
            />
            <polygon
              points="100,50 150,75 135,125 65,125 50,75"
              fill="#8A6B4E"
              opacity="0.5"
            />
          </svg>
          <svg
            aria-hidden="true"
            className="absolute bottom-1/3 left-1/3 w-80 h-80 opacity-15"
            viewBox="0 0 200 200"
          >
            <rect
              x="50"
              y="50"
              width="100"
              height="100"
              rx="20"
              fill="none"
              stroke="#8A6B4E"
              strokeWidth="3"
            />
            <rect
              x="70"
              y="70"
              width="60"
              height="60"
              rx="10"
              fill="#8A6B4E"
              opacity="0.3"
            />
          </svg>
        </div>

        {/* Large faded orange/brown star graphic - Bottom Right, Cut Off */}
        <div className="absolute -bottom-20 -right-20 w-[400px] h-[400px] md:w-[700px] md:h-[700px] lg:w-[800px] lg:h-[800px] opacity-15 pointer-events-none z-0">
          <svg
            aria-hidden="true"
            viewBox="0 0 200 200"
            className="w-full h-full"
          >
            <path
              d="M100 20 L120 80 L180 80 L135 115 L155 175 L100 140 L45 175 L65 115 L20 80 L80 80 Z"
              fill="#D4A574"
              className="opacity-40"
            />
          </svg>
        </div>

        {/* Content - Left Aligned */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
          {/* Main Title - "Restore Assist" */}
          <h1
            className="hero-fade-up hero-fade-up-1 text-6xl md:text-8xl lg:text-9xl font-bold text-white mb-6 leading-tight text-left"
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Restore <br /> Assist
          </h1>

          {/* Subtitle */}
          <p
            className="hero-fade-up hero-fade-up-2 text-xl md:text-2xl lg:text-3xl text-white/90 font-light italic text-left"
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            One System. Fewer Gaps. <br /> More Confidence.
          </p>

          {/* Supporting Description.
              BRAND.description is spine-locked verbatim per Synthex
              ceo-foundation.md Brief 4 — do NOT paraphrase it here. */}
          <p
            className="hero-fade-up hero-fade-up-3 text-lg md:text-xl text-white/80 font-light max-w-2xl text-left mt-6 leading-relaxed"
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {BRAND.description}
          </p>

          {/* ── Funnel proof bullets ───────────────────────────────────────
              DRAFT COPY — NEEDS HUMAN VOICE REVIEW before launch.
              Source: docs/marketing/pillar-c/copy-pack.md §2 ("Three proof
              bullets"). Lightly trimmed to fit the hero; the verbatim
              long-form lives in the copy pack. Kept honest re: which
              capability gates are live vs. Phase 5+ (no false promises).
              Reviewer: confirm tone matches BrandConfig banned-vocab list
              and that the IICRC citation edition/section stays exact. */}
          <ul
            className="hero-fade-up hero-fade-up-3 mt-6 max-w-2xl space-y-3 text-left text-white/85"
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-1 text-brand-gold">
                ●
              </span>
              <span>
                <strong className="text-white">
                  One field in. Eleven fields out.
                </strong>{" "}
                Your ABN drives parallel hydration against the Australian
                Business Register, your website, and a 2026 Australian pricing
                dataset.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-1 text-brand-gold">
                ●
              </span>
              <span>
                <strong className="text-white">
                  Every wired capability is checked before Activate.
                </strong>{" "}
                Live checks on AI report generation and integration health.
                Chain-of-custody, sample-report render, and welcome-email gates
                ship in Phase 5+.
              </span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-1 text-brand-gold">
                ●
              </span>
              <span>
                <strong className="text-white">
                  IICRC S500:2021 §7.1 cited correctly in every report footer.
                </strong>{" "}
                GST at 10%. ABN at 11 digits. State codes routed through the
                correct jurisdictional authority.
              </span>
            </li>
          </ul>

          {/* CTA Buttons.
              Primary href stays BRAND.cta.primary.href (/signup) — locked route.
              Label is the finalized funnel CTA from copy-pack §2.
              Secondary points to BRAND.cta.secondary.href (/how-it-works). */}
          <div className="hero-fade-up hero-fade-up-4 flex flex-col sm:flex-row gap-4 mt-8">
            <Link
              href={BRAND.cta.primary.href}
              className="px-8 py-3 bg-brand-cta text-white font-medium rounded-lg shadow-lg hover:bg-brand-cta-hover transition-all duration-300 text-center"
              style={{
                fontFamily:
                  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              {/* DRAFT CTA copy — copy-pack §2 "Primary CTA". Human voice review. */}
              Start with your ABN — under 90 seconds
            </Link>
            <Link
              href={BRAND.cta.secondary.href}
              className="px-8 py-3 border-2 border-brand-bronze text-white font-medium rounded-lg hover:bg-brand-bronze/20 transition-all duration-300 text-center"
              style={{
                fontFamily:
                  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              {BRAND.cta.secondary.label}
            </Link>
          </div>
        </div>

        {/* Founder Avatar — bottom-left, floating orb.
            greetingVideoUrl is intentionally omitted: the HeyGen greeting
            asset (/videos/heygen/phill-greeting.mp4) isn't bundled yet, so the
            orb degrades to its greeting tooltip instead of opening an empty
            video modal. Restore the prop once the asset (or
            HEYGEN_GREETING_VIDEO_URL) is wired up. */}
        <AvatarOrb
          className="hidden md:flex absolute bottom-8 left-8"
          size={72}
          avatarImageUrl="/avatars/phill-mcgurk-orb.svg"
          greetingText="G'day — I'm Phill. Click to learn about RestoreAssist."
        />
      </section>

      {/* Section - Inspection. Scoping. Estimating. Connected. */}
      <section
        className={`py-20 px-6 relative transition-colors duration-300 bg-brand-mist/30 overflow-hidden`}
      >
        {/* Golden Gradient Background Behind Section */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-full">
            <div className="w-full h-full bg-gradient-to-r from-brand-bronze/25 via-brand-gold/15 to-transparent blur-3xl"></div>
          </div>
        </div>

        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-brand-bronze/22 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-[450px] h-[450px] bg-brand-bronze/20 rounded-full blur-3xl"></div>
          <svg
            aria-hidden="true"
            className="absolute top-1/3 right-1/4 w-96 h-96 opacity-20"
            viewBox="0 0 200 200"
          >
            <polygon
              points="100,20 180,60 160,140 40,140 20,60"
              fill="#8A6B4E"
            />
            <polygon
              points="100,50 150,75 135,125 65,125 50,75"
              fill="#8A6B4E"
              opacity="0.5"
            />
          </svg>
          <svg
            aria-hidden="true"
            className="absolute bottom-1/3 left-1/3 w-80 h-80 opacity-15"
            viewBox="0 0 200 200"
          >
            <rect
              x="50"
              y="50"
              width="100"
              height="100"
              rx="20"
              fill="none"
              stroke="#8A6B4E"
              strokeWidth="3"
            />
            <rect
              x="70"
              y="70"
              width="60"
              height="60"
              rx="10"
              fill="#8A6B4E"
              opacity="0.3"
            />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <h2 className="sr-only">How It Works</h2>
          <h2
            className="text-3xl md:text-4xl font-bold mb-8 text-center text-brand-navy"
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Inspection to Report in One Flow
          </h2>
          {/* Mobile Carousel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex justify-center"
          >
            <MobileWorkflowCarousel darkMode={true} />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className={`py-16 px-6 border-t relative transition-colors duration-300 bg-brand-mist/30 overflow-hidden border-brand-slate/30`}
      >
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-1/4 w-[550px] h-[550px] bg-brand-bronze/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-1/4 w-[500px] h-[500px] bg-brand-bronze/18 rounded-full blur-3xl"></div>
          <svg
            aria-hidden="true"
            className="absolute top-1/4 left-1/3 w-96 h-96 opacity-20"
            viewBox="0 0 200 200"
          >
            <path
              d="M100 30 Q140 30 170 60 Q170 100 140 130 Q100 130 60 130 Q30 100 30 60 Q30 30 60 30 Z"
              fill="#8A6B4E"
            />
            <path
              d="M100 60 Q130 60 150 80 Q150 100 130 120 Q100 120 70 120 Q50 100 50 80 Q50 60 70 60 Z"
              fill="#8A6B4E"
              opacity="0.4"
            />
          </svg>
          <svg
            aria-hidden="true"
            className="absolute bottom-1/4 right-1/3 w-80 h-80 opacity-15"
            viewBox="0 0 200 200"
          >
            <ellipse
              cx="100"
              cy="100"
              rx="70"
              ry="50"
              fill="none"
              stroke="#8A6B4E"
              strokeWidth="3"
            />
            <ellipse
              cx="100"
              cy="100"
              rx="40"
              ry="30"
              fill="#8A6B4E"
              opacity="0.3"
            />
          </svg>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className={`text-4xl md:text-5xl font-bold mb-6 text-center text-white`}
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {BRAND.slogan}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={`text-lg md:text-xl max-w-4xl mx-auto leading-relaxed text-center mb-20 text-white/90`}
            style={{
              fontFamily:
                'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {BRAND.description}
          </motion.p>
          <div className="grid md:grid-cols-5 gap-12">
            {/* Left Side - Brand Information */}
            <div className="md:col-span-2">
              <div className="flex items-start gap-4 mb-6">
                <Link href="/" className="shrink-0">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center relative overflow-hidden">
                    <Image
                      src="/logo.png"
                      alt="Restore Assist Logo"
                      width={80}
                      height={80}
                      className="object-contain p-2"
                    />
                  </div>
                </Link>
                <div>
                  <h3
                    className={`text-3xl font-bold mb-2 text-white`}
                    style={{
                      fontFamily:
                        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    Restore Assist
                  </h3>
                  <p
                    className={`text-sm mb-4 text-white/80`}
                    style={{
                      fontFamily:
                        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    AI-powered damage assessment platform for Australian
                    restoration professionals.
                  </p>
                  <div
                    className={`text-xs space-y-1 text-white/70`}
                    style={{
                      fontFamily:
                        'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    }}
                  >
                    <p>Restore Assist by Unite-Group Nexus Pty Ltd</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Navigation Columns */}
            <div className="md:col-span-3 grid md:grid-cols-3 gap-8">
              {/* PRODUCT */}
              <div>
                <h4
                  className={`font-bold mb-4 text-sm text-white`}
                  style={{
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  PRODUCT
                </h4>
                <ul
                  className={`space-y-2 text-sm text-white/80`}
                  style={{
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  <li>
                    <Link
                      href="/features"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Features
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/pricing"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Pricing
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dashboard/analytics"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Analytics
                    </Link>
                  </li>
                </ul>
              </div>

              {/* RESOURCES */}
              <div>
                <h4
                  className={`font-bold mb-4 text-sm text-white`}
                  style={{
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  RESOURCES
                </h4>
                <ul
                  className={`space-y-2 text-sm text-white/80`}
                  style={{
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  <li>
                    <Link
                      href="/help"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Help Centre
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/compliance-library"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Compliance Library
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/blog"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Blog
                    </Link>
                  </li>
                </ul>
              </div>

              {/* COMPANY */}
              <div>
                <h4
                  className={`font-bold mb-4 text-sm text-white`}
                  style={{
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  COMPANY
                </h4>
                <ul
                  className={`space-y-2 text-sm text-white/80`}
                  style={{
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  <li>
                    <Link
                      href="/about"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      About
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/how-it-works"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      How it Works
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/compliance"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Compliance
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/contact"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/faq"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      FAQ
                    </Link>
                  </li>
                  {/* RA-2078: Privacy Policy + Terms of Service required by
                      Google OAuth verification. Both routes already exist
                      (app/privacy/page.tsx, app/terms/page.tsx); they were
                      just not linked from the home-page footer. */}
                  <li>
                    <Link
                      href="/privacy"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      className={`inline-block py-2.5 min-h-[44px] transition-colors hover:text-white`}
                    >
                      Terms of Service
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
