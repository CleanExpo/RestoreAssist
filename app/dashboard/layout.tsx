import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";

import DashboardShell from "./DashboardShell";

/**
 * Thin SERVER layout over the client dashboard shell.
 *
 * App Review 3.1.1: the iOS Capacitor shell loads server-rendered HTML
 * (capacitor.config.ts server.url), and React 19 uses getServerSnapshot while
 * hydrating — so a client-only platform check always lands after WKWebView has
 * painted. The verdict must come from the request user-agent, on the server.
 *
 * Why here and not in the root layout: calling headers() opts a segment out of
 * static rendering. Every BillingGate call site lives under /dashboard,
 * /pricing or /compliance, so scoping the read to those three segments keeps
 * the marketing and blog routes static while still closing the paint window
 * everywhere billing UI can appear.
 *
 * The previous 821-line client layout is unchanged, moved to DashboardShell.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isIosShell = isIosShellUserAgent((await headers()).get("user-agent"));

  return (
    <ShellPlatformProvider isIosShell={isIosShell}>
      <DashboardShell>{children}</DashboardShell>
    </ShellPlatformProvider>
  );
}
