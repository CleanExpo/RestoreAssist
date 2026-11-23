import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { MarketingShell } from "@/components/landing/home/MarketingShell";
import { isIosShellUserAgent } from "@/lib/capacitor";
import { Metadata } from "next";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

export const metadata: Metadata = {
  // RA-7665: alignment, not certification. ANSI/IICRC S500:2021 is the IICRC
  // publication; AS-IICRC S500:2025 is its Australian adoption.
  title: "Restoration Reports Aligned to IICRC S500:2021 | RestoreAssist",
  description:
    "How RestoreAssist maps to ANSI/IICRC S500:2021, adopted in Australia as AS-IICRC S500:2025. A field-by-field reference for Australian restoration contractors, written so the documentation you produce stands up when an assessor reviews it.",
  keywords: [
    "IICRC S500 2021 alignment",
    "water damage restoration Australia",
    "S500 aligned reports",
    "restoration software IICRC",
    "insurance restoration documentation",
    "ANSI/IICRC S500",
  ],
  openGraph: {
    title: "IICRC S500:2021 Alignment in RestoreAssist",
    description:
      "Field-by-field mapping of IICRC S500:2021 requirements to RestoreAssist features. For Australian restoration contractors.",
    type: "website",
    images: [
      OG_SHARE_IMAGE,
    ],
  },
  alternates: { canonical: "/compliance" },
};

// App Review 3.1.1 — this segment renders a BillingGate, so the platform must
// be resolved on the SERVER (the iOS shell loads server-rendered HTML). Scoped
// here rather than in the root layout so only the segments that actually gate
// billing opt out of static rendering.
export default async function ComplianceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isIosShell = isIosShellUserAgent((await headers()).get("user-agent"));
  return (
    <ShellPlatformProvider isIosShell={isIosShell}>
      <MarketingShell>{children}</MarketingShell>
    </ShellPlatformProvider>
  );
}
