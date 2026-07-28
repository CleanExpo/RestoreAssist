"use client";

import { AvatarOrb } from "@/components/avatar";
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

/**
 * Marketing home — visual language mirrors /dashboard:
 * slate-950 canvas, slate-800/50 glass cards, blue→cyan CTAs.
 * Spine-locked BRAND copy is preserved in hero, final CTA, and footer.
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <LandingNav />
      <main>
        <LandingHero />
        <WorkflowSection />
        <BentoFeatures />
        <DamageCoverage />
        <StatesSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <LandingFooter />

      <AvatarOrb
        className="fixed bottom-6 left-6 z-40 hidden md:flex"
        size={64}
        avatarImageUrl="/avatars/phill-mcgurk-orb.svg"
        greetingText="G'day — I'm Phill. Click to learn about RestoreAssist."
      />
    </div>
  );
}
