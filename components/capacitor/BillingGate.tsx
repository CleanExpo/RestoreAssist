// components/capacitor/BillingGate.tsx — RA-1842 Path B
//
// Wrap pricing / upgrade / billing surfaces in this component. On the
// web it's a transparent passthrough; in the iOS Capacitor shell it
// renders an explanatory placeholder telling the user that billing
// happens on the website.
//
// Why client-only: the Capacitor detection relies on
// `navigator.userAgent` + the `@capacitor/core` runtime, neither of
// which exist during SSR.
//
// HOW THIS GATE STAYS SAFE (App Review 3.1.1) — READ BEFORE CHANGING IT.
//
// capacitor.config.ts:22 points the iOS shell at https://restoreassist.app
// (no output:"export"), so every screen the shell shows is SERVER-RENDERED.
// React 19 also uses getServerSnapshot while hydrating, so any client-only
// detection lands after WKWebView has already painted. Client detection alone
// therefore CANNOT close this — the server verdict is load-bearing.
//
// The chain, all four links required:
//   1. capacitor.config.ts ios.appendUserAgent adds IOS_SHELL_UA_TOKEN
//   2. app/layout.tsx (server) reads the request UA and computes isIosShell
//   3. ShellPlatformProvider carries that verdict into the client tree
//   4. this component prefers the server verdict over its client read
// Break any link and the paint window reopens with every test still green,
// which is why __tests__/BillingGate.test.tsx has an explicit wiring guard.
//
// Two constraints that are easy to violate by accident:
//   - Never place a BillingGate under a `dynamic = "force-static"` route:
//     headers() returns empty there, the verdict silently becomes false, and
//     the fail-open response is CDN-cached for everyone.
//   - Shells built before the token was added send the old UA and are NOT
//     covered — they are exposed exactly as before until users update.

"use client";

import { useSyncExternalStore } from "react";
import { shouldHideBillingUI } from "@/lib/capacitor";
import { useServerIosShell } from "./ShellPlatformProvider";

// The platform never changes within a session, so there is nothing to
// subscribe to — this store exists purely to read the platform SYNCHRONOUSLY
// during render with a distinct server snapshot.
const noopSubscribe = () => () => {};
// A server request is never an iOS Capacitor shell, so SSR must render the
// children: that is what keeps the public /pricing page crawlable and avoids
// flashing a placeholder at web users. React tolerates the server/client
// snapshot difference here by design — that is what getServerSnapshot is for.
const getServerSnapshot = () => false;

interface BillingGateProps {
  children: React.ReactNode;
  /**
   * Optional override for what to render in the iOS shell instead of
   * `children`. Defaults to a workspace-admin framed placeholder with
   * no external links or CTAs (App Review 3.1.1 compliance).
   */
  fallback?: React.ReactNode;
}

export default function BillingGate({ children, fallback }: BillingGateProps) {
  // Read synchronously during render. The previous implementation set this in
  // useEffect, so on iOS the real billing UI was COMMITTED for one render
  // before being hidden — an App Review 3.1.1 exposure at every call site.
  // Server verdict from the request user-agent (null when the provider is
  // absent, e.g. an isolated unit test).
  const serverVerdict = useServerIosShell();

  // Client-side synchronous read. When the server already said "iOS shell",
  // that wins for BOTH the SSR pass and hydration, which is what closes the
  // paint window. Otherwise fall back to detecting on the client — that still
  // covers client-side navigation and older shells built before the UA token.
  const clientHide = useSyncExternalStore(
    noopSubscribe,
    shouldHideBillingUI,
    getServerSnapshot,
  );

  const hideBilling = serverVerdict === true || clientHide;

  if (!hideBilling) {
    return <>{children}</>;
  }

  // `fallback === undefined` means "not provided" — an explicitly passed
  // `null` means "render nothing", which `??` would have swallowed.
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
      role="status"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        Managed by your workspace
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The RestoreAssist iOS app is free for field use. Subscriptions, billing
        and account upgrades are managed by your workspace administrator. Sign
        in with your workspace email once your employer activates a
        subscription.
      </p>
    </div>
  );
}
