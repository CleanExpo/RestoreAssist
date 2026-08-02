"use client";

import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import {
  LandingNav,
  LandingHero,
  WorkflowSection,
  BeforeAfterSection,
  BentoFeatures,
  DamageCoverage,
  StatesSection,
  FAQSection,
  FinalCTA,
  LandingFooter,
} from "@/components/landing/home";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-landing-display",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-landing",
});

/**
 * Archived Home 1 — Dawn Split.
 * Kept in codebase for reference; live homepage is Claim Spine at `/`.
 */
export default function DawnSplitPage() {
  return (
    <div
      className={`${outfit.variable} ${jakarta.variable} ${jakarta.className} min-h-screen bg-[#F3F5F7] text-[#0B1F3A] antialiased [text-rendering:optimizeLegibility]`}
    >
      <LandingNav />
      <main id="main-content">
        <LandingHero />
        <WorkflowSection />
        <BeforeAfterSection />
        <BentoFeatures />
        <DamageCoverage />
        <StatesSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
