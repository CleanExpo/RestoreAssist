import type { Metadata } from "next";
import HomePage from "@/components/landing/HomePage";
import { BRAND } from "@/lib/brand";
import { HOME } from "@/components/landing/home/homeContent";
import { PRICING_CONFIG } from "@/lib/pricing";

const trialDays = PRICING_CONFIG.free.trialDays;

/**
 * RA-7712 — regenerate the marketing home every 5 minutes (ISR) instead of
 * letting Next prerender it once with a one-year s-maxage. The page body is a
 * client component; this server wrapper exists to carry the route config.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${BRAND.name} — Restoration Management Software`,
  description: HOME.hero.valueLine,
  keywords: [
    "restoration CRM",
    "Australian restoration software",
    "IICRC S500 reporting",
    "water damage restoration software",
    "New Zealand restoration",
  ],
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: HOME.hero.valueLine,
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/" },
  other: {
    "restoreassist:trial-days": String(trialDays),
  },
};

export default function Home() {
  return <HomePage />;
}
