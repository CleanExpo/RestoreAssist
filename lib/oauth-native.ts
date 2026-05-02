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
// ─── Known limitation (tracked for follow-up) ─────────────────────────
//
// Cookie isolation: the SFSafariViewController has its own cookie jar
// that does NOT share with the parent WKWebView. So when next-auth
// completes the OAuth dance and sets a `restoreassist.app` session
// cookie inside the SFSafariViewController, the user closes the
// browser and lands back in the WebView WITHOUT a session.
//
// Two follow-up fixes are tracked in RA-1842:
//   1. Universal Links (Apple App Site Association at /.well-known/
//      apple-app-site-association + associated-domains capability) —
//      when the OAuth callback redirects to https://restoreassist.app/
//      dashboard, iOS auto-closes SFSafariViewController and routes
//      the URL into the WebView. The session cookie travels with it.
//   2. Sign in with Apple (Apple guideline 4.8) — uses native
//      ASAuthorizationController which has proper cookie integration
//      with the parent app. Strongly preferred long-term for iOS.
//
// For PR #866 the goal is narrow: get past Apple's ground-3
// rejection. The session-cookie UX gap closes when 1 or 2 ships.

"use client";

import { signIn, type SignInOptions } from "next-auth/react";
import { isCapacitorIOS, openInAppBrowser } from "@/lib/capacitor";

export type OAuthProvider = "google";

/**
 * Sign in with an external OAuth provider, using the Capacitor in-app
 * browser when on iOS so the OAuth flow stays inside SFSafariViewController.
 *
 * On web: identical behaviour to `next-auth/react#signIn(provider, options)`.
 *
 * On iOS Capacitor: opens `/api/auth/signin/{provider}?callbackUrl=...`
 * in SFSafariViewController. The user completes Google OAuth inside
 * the embedded browser. **Cookie sync to the WebView is a follow-up**
 * (Universal Links or Sign in with Apple).
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
  // SFSafariViewController. The redirect inside the embedded browser
  // hits accounts.google.com → next-auth callback → restoreassist.app
  // dashboard. iOS auto-closes the SFSafariViewController when the
  // final redirect lands on a Universal-Linked URL (RA-1842 follow-up).
  const callbackUrl = options?.callbackUrl ?? "/dashboard";
  const absoluteCallback = callbackUrl.startsWith("http")
    ? callbackUrl
    : new URL(
        callbackUrl,
        typeof window !== "undefined"
          ? window.location.origin
          : "https://restoreassist.app",
      ).toString();

  const params = new URLSearchParams({ callbackUrl: absoluteCallback });
  const url =
    typeof window !== "undefined"
      ? new URL(`/api/auth/signin/${provider}?${params}`, window.location.origin).toString()
      : `https://restoreassist.app/api/auth/signin/${provider}?${params}`;

  await openInAppBrowser(url, { presentationStyle: "fullscreen" });
}
