import { Metadata } from "next";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

export const metadata: Metadata = {
  title: "Features - AI-Assisted Damage Assessment & IICRC S500 Alignment",
  description:
    "Discover RestoreAssist features used by Australian restorers: AI-assisted report generation, IICRC S500 alignment, cost estimation, interactive forms, and offline field capture for water damage restoration professionals.",
  keywords: [
    "restoration software features",
    "AI report generation",
    "IICRC S500 compliance",
    "water damage assessment",
    "cost estimation software",
    "interactive inspection forms",
    "restoration CRM",
  ],
  openGraph: {
    title:
      "Features - AI-Assisted Damage Assessment & IICRC S500 Alignment | RestoreAssist",
    description:
      "AI-assisted report generation, IICRC S500 alignment, and comprehensive restoration tools used by Australian professionals.",
    type: "website",
    images: [
      OG_SHARE_IMAGE,
    ],
  },
  alternates: { canonical: "/features" },
};

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
