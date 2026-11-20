import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Restoration Evidence Score | RestoreAssist Australia",
  description:
    "Score the strength of your restoration job documentation in under two minutes. Identify evidence gaps before they become reporting, invoicing, or payment problems.",
  keywords: [
    "restoration documentation Australia",
    "water damage documentation",
    "restoration evidence score",
    "restoration reporting software",
    "restoration job file audit",
  ],
  openGraph: {
    title: "How defensible is your restoration job file?",
    description:
      "Take the free RestoreAssist Evidence Score and find the three biggest gaps in your job documentation.",
    type: "website",
    images: [
      OG_SHARE_IMAGE,
    ],
  },
  alternates: { canonical: "/evidence-score" },
};

import { MarketingShell } from "@/components/landing/home/MarketingShell";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

export default function EvidenceScoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
