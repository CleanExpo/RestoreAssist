import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing - Restoration Report Software Plans Australia",
  description:
    "RestoreAssist pricing plans starting from affordable monthly subscriptions. Choose the right plan for your restoration business with features like unlimited reports, IICRC S500 alignment, and AI-assisted assessments used by certified restorers.",
  keywords: [
    "restoration software pricing",
    "restoration report software cost",
    "IICRC software pricing",
    "water damage software plans",
    "restoration business software",
    "affordable restoration tools",
  ],
  openGraph: {
    title:
      "Pricing - Restoration Report Software Plans Australia | Restore Assist",
    description:
      "Affordable pricing plans for restoration professionals. Unlimited reports, IICRC S500 alignment included.",
    type: "website",
    images: [
      { url: "/logo.png", width: 512, height: 512, alt: "Restore Assist" },
    ],
  },
  alternates: { canonical: "/pricing" },
};

// App Review 3.1.1 — this segment renders a BillingGate, so the platform must
// be resolved on the SERVER (the iOS shell loads server-rendered HTML). Scoped
// here rather than in the root layout so only the segments that actually gate
// billing opt out of static rendering.
export default async function PricingLayout({
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
