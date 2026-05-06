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
    const mod = require("@capacitor/core") as {
      Capacitor: typeof CapacitorType;
    };
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
  const { Browser } = (await import("@capacitor/browser")) as {
    Browser: {
      open: (opts: {
        url: string;
        presentationStyle?: string;
      }) => Promise<void>;
    };
  };
  await Browser.open({
    url,
    presentationStyle: options?.presentationStyle ?? "fullscreen",
  });
}

// ─── Native field-tech helpers (RA-1842, App Review 4.2) ────────────────
//
// Apple App Review (build 1.0(6), 2026-05-04) flagged 4.2 "Minimum
// Functionality" because the iOS shell was effectively a WebView with
// only one native feature (meter-photo OCR). Build 1.0(7) adds a
// coherent native field-toolkit: GPS site tagging, native iOS share
// sheet for reports, haptic feedback on capture/save, and local
// notifications for follow-up reminders. Each helper below:
//   - lazy-imports its plugin (no native code in the web bundle),
//   - is a no-op (or web fallback) outside the iOS Capacitor shell,
//   - swallows errors so callers can fire-and-forget.

export interface NativeCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

/**
 * Request the device's current GPS coordinates. Resolves to null when
 * not running inside a Capacitor shell, when permission is denied, or
 * when the platform fails to acquire a fix. Caller should reverse-
 * geocode separately.
 */
export async function getCurrentLocation(): Promise<NativeCoordinates | null> {
  if (!isCapacitor()) return null;
  try {
    const { Geolocation } = (await import("@capacitor/geolocation")) as {
      Geolocation: {
        requestPermissions: () => Promise<{ location: string }>;
        getCurrentPosition: (opts?: {
          enableHighAccuracy?: boolean;
          timeout?: number;
        }) => Promise<{
          coords: { latitude: number; longitude: number; accuracy?: number };
        }>;
      };
    };
    const perm = await Geolocation.requestPermissions();
    if (perm.location === "denied") return null;
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10_000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  } catch {
    return null;
  }
}

/**
 * Open the native iOS share sheet (UIActivityViewController) for a
 * file URI, falling back to Web Share API or no-op on web.
 * Returns true when the share dialog was actually presented.
 */
export async function shareNativeFile(opts: {
  title: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  if (!isCapacitor()) {
    // Web fallback — use the browser Share API if available.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as { share: (d: object) => Promise<void> }).share({
          title: opts.title,
          text: opts.text,
          url: opts.url,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: opts.title,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a Blob into the Capacitor filesystem cache directory and open
 * the native iOS share sheet for it. Falls back to a normal browser
 * download via an anchor element on web. Returns true if the native
 * share sheet was actually presented.
 */
export async function shareBlobNatively(opts: {
  blob: Blob;
  fileName: string;
  title: string;
}): Promise<boolean> {
  // Web fallback — old-school anchor download. Caller can revoke the URL.
  if (!isCapacitor()) {
    if (typeof window === "undefined") return false;
    const objectUrl = URL.createObjectURL(opts.blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = opts.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return false;
  }

  // Native — write to cache dir, then call Share.
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const base64 = await blobToBase64(opts.blob);
    const written = await Filesystem.writeFile({
      path: opts.fileName,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: opts.title,
      url: written.uri,
      dialogTitle: opts.title,
    });
    return true;
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // strip the "data:...;base64," prefix Capacitor doesn't want
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.readAsDataURL(blob);
  });
}

type HapticKind = "light" | "success" | "warning" | "error";

/**
 * Fire a native haptic. No-op outside the Capacitor shell. Errors are
 * swallowed — never let a haptic failure interrupt the user flow.
 */
export async function fireHaptic(kind: HapticKind): Promise<void> {
  if (!isCapacitor()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = (await import(
      "@capacitor/haptics"
    )) as {
      Haptics: {
        impact: (opts: { style: string }) => Promise<void>;
        notification: (opts: { type: string }) => Promise<void>;
      };
      ImpactStyle: { Light: string; Medium: string; Heavy: string };
      NotificationType: { Success: string; Warning: string; Error: string };
    };
    if (kind === "light") {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (kind === "success") {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (kind === "warning") {
      await Haptics.notification({ type: NotificationType.Warning });
    } else {
      await Haptics.notification({ type: NotificationType.Error });
    }
  } catch {
    /* no-op */
  }
}

export interface FollowUpReminder {
  /** Stable numeric id — caller persists this so the notification can be cancelled later. */
  id: number;
  title: string;
  body: string;
  /** Absolute fire time. */
  at: Date;
  /** Arbitrary payload to round-trip on tap (e.g. inspectionId). */
  extra?: Record<string, unknown>;
}

/**
 * Request notification permission and schedule a single local
 * notification. Returns true if scheduling succeeded.
 */
export async function scheduleFollowUpReminder(
  reminder: FollowUpReminder,
): Promise<boolean> {
  if (!isCapacitor()) return false;
  try {
    const { LocalNotifications } = (await import(
      "@capacitor/local-notifications"
    )) as {
      LocalNotifications: {
        requestPermissions: () => Promise<{ display: string }>;
        schedule: (opts: {
          notifications: Array<{
            id: number;
            title: string;
            body: string;
            schedule: { at: Date };
            extra?: Record<string, unknown>;
          }>;
        }) => Promise<unknown>;
      };
    };
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: reminder.id,
          title: reminder.title,
          body: reminder.body,
          schedule: { at: reminder.at },
          extra: reminder.extra,
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

// Test hook — lets unit tests pretend they're inside a Capacitor shell
// without spinning up a real WebView. NOT exported from the package
// barrel; only consumed inside `__tests__/`.
export function __setCapacitorForTesting(c: typeof CapacitorType | null): void {
  _capacitor = c;
}
