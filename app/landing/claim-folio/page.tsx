"use client";

import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { LandingNav, LandingFooter } from "@/components/landing/home";
import { ClaimFolioLanding } from "@/components/landing/concepts/claim-folio/ClaimFolioLanding";

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
