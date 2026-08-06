import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - Restoration Report Software Plans Australia",
  // "unlimited reports" was FALSE — PRICING_CONFIG.pricing.monthly.reportLimit
  // is 50 per month, with paid top-up packs beyond it. "used by certified
  // restorers" was an unsubstantiated social-proof claim, the same one removed
  // from the SoftwareApplication schema in components/seo/JsonLd.tsx; nothing
  // in this repo backs it. Metadata is a claim surface like any other, and it
  // is the one that ends up in search results.
  description:
    "RestoreAssist pricing for Australian restoration contractors. 50 inspection reports a month on the $99 plan, per-report rates published, IICRC S500 alignment, and AI-assisted assessment on your own provider key.",
  keywords: [
    "restoration software pricing",
    "restoration report software cost",
    "IICRC software pricing",
    "water damage software plans",
    "restoration business software",
    "affordable restoration tools",
  ],
  openGraph: {
    title:
      "Pricing - Restoration Report Software Plans Australia | Restore Assist",
    description:
      "Pricing for Australian restoration professionals. 50 inspection reports a month, per-report rates published, IICRC S500 alignment.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/pricing" },
};

// App Review 3.1.1 — this segment renders a BillingGate, so the platform must
// be resolved on the SERVER (the iOS shell loads server-rendered HTML). Scoped
// here rather than in the root layout so only the segments that actually gate
// billing opt out of static rendering.
export default async function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isIosShell = isIosShellUserAgent((await headers()).get("user-agent"));
  return (
    <ShellPlatformProvider isIosShell={isIosShell}>
      {/*
        The scroll-reveal animation renders its hidden state INTO the server
        HTML — the sections ship as style="opacity:0;transform:translateY(16px)"
        and only become visible once framer-motion's whileInView runs on the
        client. With JavaScript disabled the pricing tables, the comparison and
        the cost disclosure are all blank, which is the worst possible content
        to lose: a buyer sees a page that appears to have no prices at all.

        An author stylesheet !important declaration beats an inline
        non-important one, so this restores them without touching the animation
        for everyone else.

        Known limit, stated rather than glossed: this covers JavaScript
        DISABLED. It does not cover JavaScript that loads and then fails, since
        <noscript> does not apply in that case. Fixing that properly means not
        rendering the hidden state server-side at all, which is a change to the
        shared landing motion tokens and affects every marketing page.
      */}
      <noscript>
        <style>{`[style*="opacity:0"]{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      {children}
    </ShellPlatformProvider>
  );
}
