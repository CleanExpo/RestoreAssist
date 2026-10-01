"use client";

import { outfit, jakarta } from "@/app/fonts/landing";
import { LandingNav, LandingFooter } from "@/components/landing/home";
import { ClaimFolioLanding } from "@/components/landing/concepts/claim-folio/ClaimFolioLanding";

/**
 * Alias of the live Claim Spine homepage at `/`.
 * Kept so prior review links continue to work.
 */
export default function ClaimFolioPage() {
  return (
    <div
      className={`${outfit.variable} ${jakarta.variable} ${jakarta.className} min-h-screen bg-[#F0F3F6] text-[#0B1F3A] antialiased [text-rendering:optimizeLegibility]`}
    >
      <LandingNav />
      <main id="main-content">
        <ClaimFolioLanding />
      </main>
      <LandingFooter />
    </div>
  );
}
