// components/capacitor/CapacitorFetchInit.tsx — RA-1842 Path B
//
// Mount once at the root of the app (in the top-level layout). On the
// web it's a noop. Inside the iOS Capacitor shell it patches `fetch`
// so every request to a same-origin URL carries an
// `X-Capacitor-Platform: ios` header.
//
// The server-side `lib/ios-billing-guard.ts` reads this header and
// 403s billing endpoints. Together they enforce Path B (Apple
// guideline 3.1.1 compliance) without changing any individual page
// component.

"use client";

import { useEffect } from "react";
import { isCapacitorIOS } from "@/lib/capacitor";
import { CAPACITOR_PLATFORM_HEADER } from "@/lib/ios-billing-guard";

declare global {
  // Stash the original fetch on the window so the patch is idempotent
  // across HMR + multiple mounts.
  interface Window {
    __ra_unpatched_fetch__?: typeof fetch;
  }
}

export default function CapacitorFetchInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCapacitorIOS()) return;
    if (window.__ra_unpatched_fetch__) return; // already patched

    const original = window.fetch.bind(window);
    window.__ra_unpatched_fetch__ = original;

    const patched: typeof fetch = (input, init) => {
      // Only inject for same-origin requests — avoid leaking the
      // header to third-party APIs (Stripe, Google, etc.).
      let isSameOrigin = true;
      try {
        const url =
          typeof input === "string"
            ? new URL(input, window.location.origin)
            : input instanceof URL
              ? input
              : new URL((input as Request).url, window.location.origin);
        isSameOrigin = url.origin === window.location.origin;
      } catch {
        // Malformed URL — let the original handler error normally.
      }

      if (!isSameOrigin) return original(input, init);

      const newInit: RequestInit = { ...(init ?? {}) };
      const headers = new Headers(newInit.headers ?? {});
      if (!headers.has(CAPACITOR_PLATFORM_HEADER)) {
        headers.set(CAPACITOR_PLATFORM_HEADER, "ios");
      }
      newInit.headers = headers;
      return original(input, newInit);
    };

    window.fetch = patched;

    return () => {
      // Restore on unmount so dev-mode HMR doesn't accumulate patches.
      if (window.__ra_unpatched_fetch__) {
        window.fetch = window.__ra_unpatched_fetch__;
        delete window.__ra_unpatched_fetch__;
      }
    };
  }, []);

  return null;
}
