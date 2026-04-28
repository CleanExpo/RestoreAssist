import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features - AI-Assisted Damage Assessment & IICRC S500 Alignment",
  description:
    "Discover RestoreAssist features used by Australian restorers: AI-assisted report generation, IICRC S500 alignment, cost estimation, interactive forms, and real-time collaboration for water damage restoration professionals.",
  keywords: [
    "restoration software features",
    "AI report generation",
    "IICRC S500 compliance",
    "water damage assessment",
    "cost estimation software",
    "interactive inspection forms",
    "restoration collaboration tools",
  ],
  openGraph: {
    title:
      "Features - AI-Assisted Damage Assessment & IICRC S500 Alignment | Restore Assist",
    description:
      "AI-assisted report generation, IICRC S500 alignment, and comprehensive restoration tools used by Australian professionals.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
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
