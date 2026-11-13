import type { Metadata } from "next";
import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to RestoreAssist to access your dashboard, inspection reports, and team workspace.",
  robots: { index: false, follow: false },
};

/**
 * App Review 3.1.1 — the sign-up link on /login is hidden in the iOS shell.
 * The page is client-rendered, so it needs the server UA verdict here or the
 * link paints before client detection runs.
 */
export default async function LoginLayout({
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
