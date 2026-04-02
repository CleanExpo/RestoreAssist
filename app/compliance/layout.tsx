import { Metadata } from "next";

export const metadata: Metadata = {
  title: "IICRC S500:2025 Compliant Restoration Reports | RestoreAssist",
  description:
    "How RestoreAssist maps to IICRC S500:2025 — the Australian standard for professional water damage restoration. Field-by-field compliance reference for restoration contractors and insurance assessors.",
  keywords: [
    "IICRC S500 2025 compliance",
    "water damage restoration Australia",
    "S500 compliant reports",
    "restoration software IICRC",
    "insurance restoration documentation",
    "AS-IICRC S500",
  ],
  openGraph: {
    title: "IICRC S500:2025 Compliance in RestoreAssist",
    description:
      "Field-by-field mapping of IICRC S500:2025 requirements to RestoreAssist features. For Australian restoration contractors and insurance assessors.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/compliance" },
};

export default function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
