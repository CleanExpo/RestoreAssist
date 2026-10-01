"use client";

import { outfit, jakarta } from "@/app/fonts/landing";
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
