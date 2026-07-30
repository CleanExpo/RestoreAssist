"use client";

import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { LandingNav, LandingFooter } from "@/components/landing/home";
import { OperatorAtlasLanding } from "@/components/landing/concepts/operator-atlas/OperatorAtlasLanding";

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

export default function OperatorAtlasPage() {
  return (
    <div
      className={`${outfit.variable} ${jakarta.variable} ${jakarta.className} min-h-screen bg-[#FAFBFC] text-[#0B1F3A] antialiased [text-rendering:optimizeLegibility]`}
    >
      <LandingNav />
      <main id="main-content">
        <OperatorAtlasLanding />
      </main>
      <LandingFooter />
    </div>
  );
}
