import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";

/**
 * App Review 3.1.1 — /billing/* is the hard-paywall target (middleware redirects
 * trial-expired users here). It lives OUTSIDE /dashboard, so it needs its own
 * server UA verdict or BillingGate paints pricing in the iOS WebView.
 */
export default async function BillingLayout({
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
