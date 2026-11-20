import type { Metadata } from "next";
import HomePage from "@/components/landing/HomePage";
import { BRAND } from "@/lib/brand";
import { HOME } from "@/components/landing/home/homeContent";
import { PRICING_CONFIG } from "@/lib/pricing";
import { OG_SHARE_IMAGE, OG_SHARE_PATH } from "@/lib/og/constants";

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
  // RA-8473: a page-level openGraph replaces the root object wholesale, so
  // locale, siteName and the share image are restated here, not inherited.
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: HOME.hero.valueLine,
    type: "website",
    locale: "en_AU",
    siteName: BRAND.name,
    images: [
      OG_SHARE_IMAGE,
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: HOME.hero.valueLine,
    images: [OG_SHARE_PATH],
  },
  alternates: { canonical: "/" },
  other: {
    "restoreassist:trial-days": String(trialDays),
  },
};

export default function Home() {
  return <HomePage />;
}
