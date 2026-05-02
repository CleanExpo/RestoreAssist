// lib/capacitor.ts — RA-1842 / Path B
//
// Runtime detection of the Capacitor native wrapper.
//
// Why this exists:
//
// 1. Apple App Review (build 1.0(3)) rejected RestoreAssist on guideline
//    3.1.1 because the iOS WebView accesses paid digital content without
//    using Apple In-App Purchase. The strategic response is **Path B**
//    — keep the iOS app free, sell only on the web. To do that we need
//    a runtime guard that hides every billing/upgrade/subscription
//    surface when running inside the iOS Capacitor shell.
//
// 2. Apple App Review (build 1.0(3)) also rejected on guideline 4 +
//    4.8 because OAuth opens external Safari. Wrapping
//    `window.open(...)` / `<a href external>` clicks via
//    `@capacitor/browser` keeps the auth flow inside an
//    `SFSafariViewController` instead of bouncing to the OS browser.
//
// SSR + edge runtime safe — every export tolerates `typeof window
// === "undefined"` and returns `false`. So the same code can run in
// React Server Components, Edge middleware, and the client without
// branching imports.

import type { Capacitor as CapacitorType } from "@capacitor/core";

// ── Lazy core import — `@capacitor/core` is only meaningful in the
// browser bundle. RSC / middleware see `Capacitor` as undefined and
// fall through to the user-agent sniffer.
let _capacitor: typeof CapacitorType | null = null;
function _getCapacitor(): typeof CapacitorType | null {
  if (typeof window === "undefined") return null;
  if (_capacitor) return _capacitor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@capacitor/core") as { Capacitor: typeof CapacitorType };
    _capacitor = mod.Capacitor;
    return _capacitor;
  } catch {
    return null;
  }
}

/** True when running inside any Capacitor native shell (iOS or Android). */
export function isCapacitor(): boolean {
  const cap = _getCapacitor();
  if (cap?.isNativePlatform?.()) return true;
  // Fallback for when @capacitor/core hasn't loaded yet (or hasn't been
  // bundled into the page) — sniff the User-Agent. Capacitor injects
  // `CapacitorWebView` into the UA on iOS. Android injects nothing
  // useful by default but we cover the explicit cap.platform path.
  if (typeof navigator === "undefined") return false;
  return /capacitor/i.test(navigator.userAgent);
}

/** True when running inside the iOS Capacitor shell specifically. */
export function isCapacitorIOS(): boolean {
  const cap = _getCapacitor();
  if (cap?.getPlatform?.() === "ios") return true;
  if (typeof navigator === "undefined") return false;
  return /capacitor.*ios|ios.*capacitor/i.test(navigator.userAgent);
}

/** True when running inside the Android Capacitor shell specifically. */
export function isCapacitorAndroid(): boolean {
  const cap = _getCapacitor();
  return cap?.getPlatform?.() === "android";
}

/**
 * Path B guard — true when subscription / billing / upgrade surfaces
 * MUST be hidden because the platform's app-store rules force IAP and
 * we don't ship IAP. iOS only today; Android Play accepts third-party
 * billing for non-game apps so we leave Android alone.
 */
export function shouldHideBillingUI(): boolean {
  return isCapacitorIOS();
}

/**
 * Open `url` in a Capacitor in-app browser (SFSafariViewController on
 * iOS) when running inside the native shell. Falls back to a normal
 * window.open / location change on the web. Use this for OAuth /
 * sign-in / external-account redirects so Apple doesn't fail us on
 * guideline 4 again.
 *
 * Returns a promise that resolves when the in-app browser actually
 * opens — caller can `await` if they need to know the redirect started.
 */
export async function openInAppBrowser(
  url: string,
  options?: { presentationStyle?: "fullscreen" | "popover" },
): Promise<void> {
  if (!isCapacitor()) {
    // Web fallback — same behaviour as a plain anchor click.
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
    return;
  }
  // Native — lazy import so the web bundle doesn't carry the plugin.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Browser } = (await import("@capacitor/browser")) as {
    Browser: { open: (opts: { url: string; presentationStyle?: string }) => Promise<void> };
  };
  await Browser.open({
    url,
    presentationStyle: options?.presentationStyle ?? "fullscreen",
  });
}

// Test hook — lets unit tests pretend they're inside a Capacitor shell
// without spinning up a real WebView. NOT exported from the package
// barrel; only consumed inside `__tests__/`.
export function __setCapacitorForTesting(c: typeof CapacitorType | null): void {
  _capacitor = c;
}
