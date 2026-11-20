import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { MarketingShell } from "@/components/landing/home/MarketingShell";
import { isIosShellUserAgent } from "@/lib/capacitor";
import { Metadata } from "next";
import { OG_SHARE_IMAGE } from "@/lib/og/constants";

export const metadata: Metadata = {
  title: "Restoration Reports that Cite IICRC S500:2021 | RestoreAssist",
  description:
    "How RestoreAssist maps to IICRC S500:2021 — the Australian standard for professional water damage restoration. Field-by-field citation reference for Australian restoration contractors — written so the documentation you produce stands up when an assessor reviews it.",
  keywords: [
    "IICRC S500 2021 compliance",
    "water damage restoration Australia",
    "S500 report citations",
    "restoration software IICRC",
    "insurance restoration documentation",
    "ANSI/IICRC S500",
  ],
  openGraph: {
    title: "How RestoreAssist Cites IICRC S500:2021",
    description:
      "Field-by-field mapping of IICRC S500:2021 sections to RestoreAssist features. For Australian restoration contractors.",
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
