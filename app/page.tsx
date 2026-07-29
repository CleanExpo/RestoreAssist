"use client";

import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import {
  LandingNav,
  LandingHero,
  WorkflowSection,
  BentoFeatures,
  DamageCoverage,
  StatesSection,
  FAQSection,
  FinalCTA,
  LandingFooter,
} from "@/components/landing/home";

/** Display — geometric, premium, distinctive for headlines. */
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-landing-display",
});

/** Body — highly readable for long-form marketing copy. */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-landing",
});

/**
 * Marketing home — Daylight Workshop (premium).
 * Cool mist canvas · navy + steel · photo-led · operator-first.
 * No dark SaaS chrome. No AI product theatre.
 */
export default function Home() {
  return (
    <div
      className={`${outfit.variable} ${jakarta.variable} ${jakarta.className} min-h-screen bg-[#F3F5F7] text-[#0B1F3A] antialiased [text-rendering:optimizeLegibility]`}
    >
      <LandingNav />
      <main id="main-content">
        <LandingHero />
        <WorkflowSection />
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
