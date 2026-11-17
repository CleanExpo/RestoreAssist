// components/capacitor/use-hide-billing.ts — RA-8437, RA-1842 Path B
//
// The ONE client owner of "hide purchase UI in the iOS shell" (App Review
// 3.1.1). Every price, buy button, upgrade prompt or billing-portal link calls
// this hook, or sits inside <BillingGate>, which calls it. Do not re-derive the
// rule from useServerIosShell() or isCapacitorIOS() in a screen: hand copies
// drifted apart and one screen (the sketch tab's floor plan add-on) never got
// one. components/capacitor/__tests__/billing-ui-owner.test.ts fails when a
// caller of a server-guarded billing endpoint has no render path through here.
//
// The verdict is true when EITHER source says iOS shell:
//   - the server verdict (request user-agent, seeded by the segment layout via
//     ShellPlatformProvider) — load-bearing, because it is known during SSR and
//     hydration, before WKWebView paints;
//   - the client read (Capacitor runtime / navigator) — covers client-side
//     navigation, segments without a server verdict, and older shells built
//     before the user-agent token existed.
// See BillingGate.tsx for the full four-link chain.

"use client";

import { useSyncExternalStore } from "react";
import { shouldHideBillingUI } from "@/lib/capacitor";
import { useServerIosShell } from "./ShellPlatformProvider";

// The platform never changes within a session, so there is nothing to
// subscribe to: this store exists to read the platform SYNCHRONOUSLY during
// render with a distinct server snapshot.
const noopSubscribe = () => () => {};
// A server request is never the Capacitor runtime itself; the server's own
// verdict arrives through ShellPlatformProvider instead.
const getServerSnapshot = () => false;

/** True when purchase and billing UI must not render (iOS Capacitor shell). */
export function useHideBilling(): boolean {
  const serverVerdict = useServerIosShell();
  const clientHide = useSyncExternalStore(
    noopSubscribe,
    shouldHideBillingUI,
    getServerSnapshot,
  );
  return serverVerdict === true || clientHide;
}
