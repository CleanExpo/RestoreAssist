import { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { PRICING_CONFIG } from "@/lib/pricing";

const trialDays = PRICING_CONFIG.free.trialDays;
const trialReports = PRICING_CONFIG.free.trialReportCredits;

export const metadata: Metadata = {
  title: "How It Works — RestoreAssist Restoration CRM",
  description: `See how RestoreAssist moves a claim from field capture to IICRC-aligned reporting, GST invoicing, and client approval — ${trialDays}-day trial with ${trialReports} report credits. ${BRAND.tagline}`,
  keywords: [
    "how restoration software works",
    "restoration CRM workflow",
    "field capture to report",
    "IICRC S500 report process",
    "Australian restoration software",
    "client portal approvals",
  ],
  openGraph: {
    title: "How It Works — RestoreAssist",
    description:
      "From driveway capture to signed report: field evidence, desk review, GST invoicing, and portal approvals in one system.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
