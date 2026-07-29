"use client";

import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { LandingNav } from "./LandingNav";
import { LandingFooter } from "./LandingFooter";

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
 * Shared Daylight Workshop chrome for marketing pages
 * (nav, fonts, mist canvas, footer).
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${outfit.variable} ${jakarta.variable} ${jakarta.className} min-h-screen bg-[#F3F5F7] text-[#0B1F3A] antialiased [text-rendering:optimizeLegibility]`}
    >
      <LandingNav />
      <main id="main-content" className="pt-[4.25rem]">
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
