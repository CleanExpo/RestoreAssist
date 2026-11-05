import { getServerSession } from "next-auth";
import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { authOptions } from "@/lib/auth";
import { isAllowlistedPlatformSupportOperator } from "@/lib/auth/assert-tenancy";
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
 *
 * Platform staff nav (Admin, Margot, ...) is resolved here too: every business
 * owner is ADMIN, so the shell needs the server-only PLATFORM_SUPPORT_USER_IDS
 * verdict (strict membership, no development fallback). Only the boolean is
 * passed down; the allowlist stays on the server.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isIosShell = isIosShellUserAgent((await headers()).get("user-agent"));
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const isPlatformOperator =
    session?.user?.role === "ADMIN" &&
    typeof userId === "string" &&
    isAllowlistedPlatformSupportOperator(userId);

  return (
    <ShellPlatformProvider isIosShell={isIosShell}>
      <DashboardShell isPlatformOperator={isPlatformOperator}>
        {children}
      </DashboardShell>
    </ShellPlatformProvider>
  );
}
