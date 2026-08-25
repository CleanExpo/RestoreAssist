import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "IICRC S500:2021 Compliant Restoration Reports | RestoreAssist",
  description:
    "How RestoreAssist maps to IICRC S500:2021 — the Australian standard for professional water damage restoration. Field-by-field compliance reference for Australian restoration contractors — written so the documentation you produce stands up when an assessor reviews it.",
  keywords: [
    "IICRC S500 2021 compliance",
    "water damage restoration Australia",
    "S500 compliant reports",
    "restoration software IICRC",
    "insurance restoration documentation",
    "ANSI/IICRC S500",
  ],
  openGraph: {
    title: "IICRC S500:2021 Compliance in RestoreAssist",
    description:
      "Field-by-field mapping of IICRC S500:2021 requirements to RestoreAssist features. For Australian restoration contractors.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
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
      {children}
    </ShellPlatformProvider>
  );
}
