import type { Metadata } from "next";
import { headers } from "next/headers";

import { ShellPlatformProvider } from "@/components/capacitor/ShellPlatformProvider";
import { isIosShellUserAgent } from "@/lib/capacitor";

export const metadata: Metadata = {
  title: "Sign up",
  description:
    "Create a RestoreAssist account and get started in minutes. Free trial, no credit card required.",
  robots: { index: true, follow: true },
};

/**
 * App Review 3.1.1 — /signup is not offered in the iOS shell. The page is
 * client-rendered, so it needs the server UA verdict here or the form paints
 * before client detection runs.
 */
export default async function SignupLayout({
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
