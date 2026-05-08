// lib/oauth-native.ts — RA-1842 / Apple guideline 4 (Ground 3)
//
// Apple App Review (build 1.0(3), 2026-05-01):
//   "We noticed that the user is taken to the default web browser to
//    sign in or register for an account, which provides a poor user
//    experience. To resolve this issue, please revise the app to
//    enable users to sign in or register for an account in the app.
//    You may also choose to implement the Safari View Controller API
//    to display web content within the app."
//
// `next-auth`'s `signIn(provider, options)` does `window.location.href`
// which on iOS Capacitor gets punted to Safari proper for any redirect
// to a non-allow-listed origin (e.g. accounts.google.com). That's
// what Apple's reviewer flagged.
//
// `@capacitor/browser` opens URLs in `SFSafariViewController` on iOS,
// which Apple explicitly accepts as the in-app sign-in pattern. This
// module wraps `next-auth` so the OAuth dance happens inside the
// embedded browser when running in the iOS shell, and behaves
// identically to the unwrapped `signIn` on web.
//
// ─── Cookie handoff (RA-2073, 1.0.2) ──────────────────────────────────
//
// SFSafariViewController has its own cookie jar that does NOT share with
// the parent WKWebView. So when next-auth completes the OAuth dance and
// sets `__Secure-next-auth.session-token` inside SFVC, the user lands
// back in the WebView WITHOUT a session — that's the loop reported on
// 1.0.1.
//
// Universal Links route URLs but not cookies, so they alone don't close
// this gap (the original 1.0(11) assumption was wrong). The fix is the
// RFC-8252-style token handoff used by Google App Flip and AppAuth-iOS:
//
//   1. On iOS, this wrapper rewrites the OAuth callbackUrl to
//      `/api/auth/handoff/initiate?next=<original>`. NextAuth lands
//      users there post-callback (still inside SFVC, with the cookie
//      set in SFVC's jar).
//   2. /api/auth/handoff/initiate reads the cookie value verbatim,
//      mints a one-time handoff token, persists token+JWT (60s TTL),
//      and 302s to /auth/redeem?token=X&next=Y.
//   3. /auth/redeem matches the AASA "/*" rule → iOS Universal Links
//      intercepts the redirect, closes SFVC, opens /auth/redeem in
//      the parent WKWebView.
//   4. /auth/redeem returns 302 to `next` with `Set-Cookie:
//      __Secure-next-auth.session-token=<persisted JWT>`. The
//      cookie lands in WKWebView's jar (because it's a response to a
//      WKWebView fetch) and the user lands on the target with a
//      working session.
//
// On web (or non-iOS Capacitor), this wrapper falls through to plain
// `signIn(provider, options)` and the handoff dance is skipped — the
// cookie is set in the same browser context as the WebView.

"use client";

import { signIn, type SignInOptions } from "next-auth/react";
import { isCapacitorIOS, openInAppBrowser } from "@/lib/capacitor";

export type OAuthProvider = "google" | "apple";

/**
 * Sign in with an external OAuth provider, using the Capacitor in-app
 * browser when on iOS so the OAuth flow stays inside SFSafariViewController.
 *
 * On web: identical behaviour to `next-auth/react#signIn(provider, options)`.
 *
 * On iOS Capacitor: opens `/api/auth/signin/{provider}?callbackUrl=...`
 * in SFSafariViewController, with the callbackUrl wrapped to route
 * through `/api/auth/handoff/initiate` so the session cookie ferries
 * cleanly into the WKWebView (RA-2073, see comment block above).
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  options?: SignInOptions,
): Promise<void> {
  if (!isCapacitorIOS()) {
    // Web — delegate to next-auth's normal redirect-based signin.
    await signIn(provider, options);
    return;
  }

  // iOS — build the next-auth signin URL ourselves and hand it to
  // SFSafariViewController.
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://restoreassist.app";

  const requestedCallback = options?.callbackUrl ?? "/dashboard";
  const absoluteRequestedCallback = requestedCallback.startsWith("http")
    ? requestedCallback
    : new URL(requestedCallback, origin).toString();

  // Route the OAuth callback through /api/auth/handoff/initiate so the
  // session cookie set in SFVC's jar gets ferried into the WKWebView.
  // The "next" query param is the URL the user actually wanted (e.g.
  // /dashboard); /auth/redeem will 302 there with Set-Cookie.
  const handoffUrl = new URL("/api/auth/handoff/initiate", origin);
  // Pass `next` as a path or absolute URL — the initiate handler
  // restricts to same-origin paths defensively.
  const requestedAsPath = (() => {
    try {
      const u = new URL(absoluteRequestedCallback);
      return u.origin === origin ? `${u.pathname}${u.search}${u.hash}` : "/dashboard";
    } catch {
      return "/dashboard";
    }
  })();
  handoffUrl.searchParams.set("next", requestedAsPath);
  const callbackUrlForOAuth = handoffUrl.toString();

  const params = new URLSearchParams({ callbackUrl: callbackUrlForOAuth });
  const url = new URL(
    `/api/auth/signin/${provider}?${params}`,
    origin,
  ).toString();

  await openInAppBrowser(url, { presentationStyle: "fullscreen" });
}
