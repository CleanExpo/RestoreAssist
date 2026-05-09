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
//   - 1.0.3(13) shipped @capacitor-community/apple-sign-in. CI failed
//     at IPA build: that package only declares Capacitor-Swift-PM
//     7.x, but our project uses Capacitor 8.x. SwiftPM refused to
//     resolve the conflicting peer dep.
//   - 1.0.3(14) (RA-2073): same architecture (native ASAuthorizationController,
//     JS-in-WKWebView token exchange) but routed through
//     @capgo/capacitor-social-login, which is actively maintained and
//     declares Capacitor 8 peer deps. Apple-only on iOS to keep 1.0.3
//     scope tight; Google hidden.
//
// 1.0.4(15) (RA-2076): adds Google alongside Apple via the same capgo
// plugin. Same WKWebView cookie-jar story:
//   - Plugin presents Google's native sign-in sheet (no SFVC)
//   - Plugin returns the Google identity JWT to JS in WKWebView
//   - JS POSTs to /api/auth/native-token-exchange (also from inside
//     WKWebView), so the Set-Cookie response lands in WKWebView's jar
//
// Apple guideline 4.8 stays satisfied because Apple Sign-In is the peer
// option to Google in the UI (Apple required when ANY third-party
// login is offered).
//
// Web is unchanged: standard next-auth/react `signIn(provider, options)`.

"use client";

import { signIn, type SignInOptions } from "next-auth/react";
import { isCapacitorIOS } from "@/lib/capacitor";

export type OAuthProvider = "google" | "apple";

const APPLE_BUNDLE_ID =
  process.env.NEXT_PUBLIC_APPLE_BUNDLE_ID ?? "com.restoreassist.app";

// Google iOS-type OAuth client (project=restoreassist, "RestoreAssist
// iOS"). Bundle ID com.restoreassist.app, App Store ID 6761808113,
// Team L3TJL6HUJ7. The reversed-client-ID URL scheme is in
// ios/App/App/Info.plist (CFBundleURLTypes). Per Google's docs, this
// value is not a secret — the bundle-ID + iOS app-signature anchor
// is what authenticates the caller.
const GOOGLE_IOS_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  "292141944467-8hhd4eub33tplq6ep5lc9iltu8jcatvp.apps.googleusercontent.com";

// SocialLogin.initialize() is idempotent according to the plugin docs,
// but we still guard with a module-level flag so that repeated sign-in
// attempts within the same JS context don't re-walk the native init path.
let socialLoginInitialised = false;

async function ensureSocialLoginInitialised() {
  if (socialLoginInitialised) return;
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await SocialLogin.initialize({
    apple: { clientId: APPLE_BUNDLE_ID },
    google: { iOSClientId: GOOGLE_IOS_CLIENT_ID },
  });
  socialLoginInitialised = true;
}

/**
 * Sign in with an external OAuth provider.
 *
 * Web: identical to `next-auth/react#signIn(provider, options)`.
 *
 * iOS Capacitor:
 *   - Apple → native ASAuthorizationController via capgo plugin + token exchange.
 *   - Google → native Google sign-in sheet via capgo plugin + token exchange.
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

  // iOS branch — both providers share the same architecture
  await ensureSocialLoginInitialised();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  // Replay protection: random plaintext nonce. The plugin SHA-256s it
  // before forwarding to the IdP; the resulting JWT carries the SHA-256
  // hex in its `nonce` claim. The server verifies via the same hash.
  const noncePlaintext = generateNonce(32);

  let idToken: string | undefined;
  try {
    if (provider === "apple") {
      const result = await SocialLogin.login({
        provider: "apple",
        options: {
          scopes: ["email", "name"],
          nonce: noncePlaintext,
        },
      });
      idToken = result.result?.idToken ?? undefined;
    } else {
      // Google — capgo plugin presents the native iOS Google sheet.
      // We request the OpenID `email` + `profile` scopes (standard
      // sign-in scopes); the resulting Google identity JWT carries the
      // user's `sub`, email, name, and the SHA-256 of our nonce.
      const result = await SocialLogin.login({
        provider: "google",
        options: {
          scopes: ["email", "profile"],
          nonce: noncePlaintext,
        },
      });
      // GoogleLoginResponse exposes idToken at result.idToken (top-level
      // string | null). Older versions of the plugin bury it under
      // `authentication.idToken` — guard for both shapes.
      const r = result.result as
        | { idToken?: string | null; authentication?: { idToken?: string | null } }
        | undefined;
      idToken = r?.idToken ?? r?.authentication?.idToken ?? undefined;
    }
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : `${provider} sign-in was cancelled.`;
    throw new Error(msg);
  }

  if (!idToken) {
    throw new Error(`${provider} did not return an identity token.`);
  }

  // Exchange the JWT for a NextAuth session cookie. Because this fetch
  // runs in WKWebView, the Set-Cookie response lands in WKWebView's
  // cookie jar. That's the architectural fix.
  const exchangeResponse = await fetch("/api/auth/native-token-exchange", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      idToken,
      nonce: noncePlaintext,
    }),
  });

  if (!exchangeResponse.ok) {
    let details = "";
    try {
      const body = await exchangeResponse.json();
      details =
        body?.error?.message ||
        body?.error?.code ||
        `HTTP ${exchangeResponse.status}`;
    } catch {
      details = `HTTP ${exchangeResponse.status}`;
    }
    throw new Error(`${provider} sign-in failed: ${details}`);
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
