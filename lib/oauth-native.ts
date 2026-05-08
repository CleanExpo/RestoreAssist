// lib/oauth-native.ts — iOS auth dispatcher
//
// History:
//   - 1.0(3) Apple rejected on guideline 4 (OAuth opening Safari).
//     Fix: wrap in @capacitor/browser → SFSafariViewController.
//   - 1.0.1(11) un-gated Continue with Google + Continue with Apple.
//     Result: production loop — SFVC sets cookie in its own jar,
//     WKWebView never sees it.
//   - 1.0.2(12) tried RFC-8252 token-handoff via Universal Links.
//     Result: same loop. Universal Links don't reliably intercept
//     server-side 302 redirects from inside SFSafariViewController.
//
// 1.0.3 (RA-2073): bypass SFSafariViewController entirely on iOS.
//   - Apple: native ASAuthorizationController via
//     @capacitor-community/apple-sign-in. Plugin returns identity JWT
//     to JS running INSIDE the WKWebView. JS POSTs to
//     /api/auth/native-token-exchange (also from inside WKWebView), so
//     Set-Cookie lands in WKWebView's jar — directly, no handoff.
//   - Google: hidden on iOS in this build. The community Google
//     Capacitor plugin is unmaintained; rather than ship a fragile
//     dependency, iOS users sign in via Apple or email/password.
//     (Apple guideline 4.8 only triggers when offering a third-party
//     login alongside Apple; with no Google on iOS, 4.8 doesn't apply.)
//
// Web is unchanged: standard next-auth/react `signIn(provider, options)`.

"use client";

import { signIn, type SignInOptions } from "next-auth/react";
import { isCapacitorIOS } from "@/lib/capacitor";

export type OAuthProvider = "google" | "apple";

const APPLE_BUNDLE_ID =
  process.env.NEXT_PUBLIC_APPLE_BUNDLE_ID ?? "com.restoreassist.app";

/**
 * Sign in with an external OAuth provider.
 *
 * Web: identical to `next-auth/react#signIn(provider, options)`.
 *
 * iOS Capacitor:
 *   - Apple → native ASAuthorizationController + token exchange.
 *   - Google → not supported on iOS in 1.0.3; throws so UI bugs surface.
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

  // iOS branch
  if (provider === "google") {
    // Continue with Google is hidden on iOS in 1.0.3 (see app/login/page.tsx
    // and app/signup/page.tsx — the iOS-detect effect sets hideGoogleOnIos).
    // If we're here, the UI gate failed — surface the bug instead of falling
    // back to the broken SFVC flow.
    throw new Error(
      "Continue with Google is not available on iOS in this build. " +
        "Please use Continue with Apple or email/password.",
    );
  }

  // Apple — native ASAuthorizationController via Capacitor plugin.
  // Lazy-import so the web bundle doesn't pull in the plugin code.
  const { SignInWithApple } = await import(
    "@capacitor-community/apple-sign-in"
  );

  // Replay protection: random plaintext nonce. The plugin SHA-256s it
  // before forwarding to Apple. The token's `nonce` claim contains the
  // SHA-256 hex; the server verifies via the same hash.
  const noncePlaintext = generateNonce(32);

  let credential: Awaited<ReturnType<typeof SignInWithApple.authorize>>;
  try {
    credential = await SignInWithApple.authorize({
      clientId: APPLE_BUNDLE_ID,
      // The redirect URI is unused on native (ASAuthorizationController
      // returns the credential to native code, not via HTTP redirect).
      // The plugin still requires a string; pass our domain for clarity.
      redirectURI: "https://restoreassist.app/api/auth/callback/apple",
      scopes: "name email",
      nonce: noncePlaintext,
      state: generateNonce(16),
    });
  } catch (err) {
    // User cancelled OR plugin error. The plugin throws on user cancel
    // (Apple returns ASAuthorizationErrorCanceled). Re-throw with a
    // user-friendly message for the login page to surface as a toast.
    const msg =
      err instanceof Error ? err.message : "Apple sign-in was cancelled.";
    throw new Error(msg);
  }

  const idToken = credential.response?.identityToken;
  if (!idToken) {
    throw new Error("Apple did not return an identity token.");
  }

  // Exchange the JWT for a NextAuth session cookie. Because this fetch
  // runs in WKWebView, the Set-Cookie response lands in WKWebView's
  // cookie jar. That's the architectural fix.
  const exchangeResponse = await fetch("/api/auth/native-token-exchange", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "apple",
      idToken,
      nonce: noncePlaintext,
    }),
  });

  if (!exchangeResponse.ok) {
    let details = "";
    try {
      const body = await exchangeResponse.json();
      details =
        body?.error?.message || body?.error?.code || `HTTP ${exchangeResponse.status}`;
    } catch {
      details = `HTTP ${exchangeResponse.status}`;
    }
    throw new Error(`Apple sign-in failed: ${details}`);
  }

  // Cookie is now in WKWebView's jar. Navigate to the requested target.
  const callbackUrl = options?.callbackUrl ?? "/dashboard";
  if (typeof window !== "undefined") {
    window.location.href = callbackUrl;
  }
}

/**
 * Generate a URL-safe random nonce. Crypto-grade so an attacker can't
 * predict the value and replay a captured token to a different session.
 */
function generateNonce(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    // Server-side (shouldn't reach here in practice — this module is
    // "use client") — fall back to Math.random which is NOT crypto-safe.
    // Acceptable as a last resort because this branch never runs in
    // production paths.
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // base64url, stripped of padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
