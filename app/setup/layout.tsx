import type { Metadata } from "next";
import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";

export const metadata: Metadata = {
  title: "Workspace setup",
  description:
    "Configure your RestoreAssist workspace — business details, branding, and integrations.",
  robots: { index: false, follow: false },
};

/**
 * Setup renders a fixed full-viewport wizard (SetupStepper). No padding or
 * card shell here — the stepper owns the entire viewport.
 *
 * RA-8271 — the Field Add-Ons step shows the add-on card deck, which is a
 * purchase surface wrapped in BillingGate. The wizard is client-rendered, so
 * without the server user-agent verdict here the iOS app would paint prices
 * and buttons before client detection runs (App Review 3.1.1).
 */
export default async function SetupLayout({
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
