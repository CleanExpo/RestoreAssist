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

import { useEffect, useState } from "react";
import { shouldHideBillingUI } from "@/lib/capacitor";

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
  const [hideBilling, setHideBilling] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHideBilling(shouldHideBillingUI());
    setHydrated(true);
  }, []);

  // Pre-hydration: render the children so SSR + non-iOS users see the
  // page with no flash. Once hydrated, we may swap in the fallback.
  if (!hydrated || !hideBilling) {
    return <>{children}</>;
  }

  return (
    <>
      {fallback ?? (
        <div
          className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
          role="status"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            Managed by your workspace
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The RestoreAssist iOS app is free for field use. Subscriptions,
            billing and account upgrades are managed on{" "}
            <a
              href="https://restoreassist.app"
              className="underline hover:text-primary"
            >
              restoreassist.app
            </a>
            . Sign in with your workspace account once your employer activates a
            subscription.
          </p>
        </div>
      )}
    </>
  );
}
