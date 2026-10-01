"use client";

import { outfit, jakarta } from "@/app/fonts/landing";
import { LandingNav } from "./LandingNav";
import { LandingFooter } from "./LandingFooter";

/**
 * Shared Daylight Workshop chrome for marketing pages
 * (nav, fonts, mist canvas, footer).
 * Pass `chrome={false}` for auth surfaces that keep the theme without header/footer.
 */
export function MarketingShell({
  children,
  chrome = true,
}: {
  children: React.ReactNode;
  chrome?: boolean;
}) {
  return (
    <div
      className={`${outfit.variable} ${jakarta.variable} ${jakarta.className} min-h-screen bg-[#F3F5F7] text-[#0B1F3A] antialiased [text-rendering:optimizeLegibility]`}
    >
      {chrome ? <LandingNav /> : null}
      <main
        id="main-content"
        className={chrome ? "pt-[4.25rem]" : undefined}
      >
        {children}
      </main>
      {chrome ? <LandingFooter /> : null}
    </div>
  );
}
