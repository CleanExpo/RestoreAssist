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
//   4. useHideBilling (this component's owner hook) prefers the server
//      verdict over its client read
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

import { useHideBilling } from "./use-hide-billing";

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
  // The rule lives in useHideBilling (RA-8437): server verdict first, so
  // the shell never paints billing UI during SSR or hydration, then the
  // synchronous client read for client navigation and older shells.
  const hideBilling = useHideBilling();

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
