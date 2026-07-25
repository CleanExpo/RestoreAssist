// components/capacitor/BillingGate.tsx — RA-1842 Path B
//
// Wrap pricing / upgrade / billing surfaces in this component. On the
// web it's a transparent passthrough; in the iOS Capacitor shell it
// renders an explanatory placeholder telling the user that billing
// happens on the website.
//
// Why client-only: the Capacitor detection relies on
// `navigator.userAgent` + the `@capacitor/core` runtime, neither of
// which exist during SSR. Server response always includes the full
// page (so SEO + non-Capacitor browsers see pricing); the gate kicks
// in once React hydrates.

"use client";

import { useSyncExternalStore } from "react";
import { shouldHideBillingUI } from "@/lib/capacitor";

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
  const hideBilling = useSyncExternalStore(
    noopSubscribe,
    shouldHideBillingUI,
    getServerSnapshot,
  );

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
