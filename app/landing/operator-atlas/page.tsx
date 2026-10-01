"use client";

import { outfit, jakarta } from "@/app/fonts/landing";
import { LandingNav, LandingFooter } from "@/components/landing/home";
import { OperatorAtlasLanding } from "@/components/landing/concepts/operator-atlas/OperatorAtlasLanding";

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
