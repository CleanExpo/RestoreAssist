// lib/oauth-native.ts — native auth dispatcher (iOS + Android)
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
// Web clears any existing RestoreAssist session before starting OAuth. Without
// that account-switch boundary, NextAuth treats a different Google/Apple user
// as an attempt to attach an already-linked identity to the current user and
// redirects with OAuthAccountNotLinked.

"use client";

import { signIn, signOut, type SignInOptions } from "next-auth/react";
import { isCapacitorAndroid, isCapacitorIOS } from "@/lib/capacitor";
import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";

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

// Google Web-type OAuth client (project=restoreassist). On Android the
// capgo plugin requires the Web client ID — Google Sign-In on Android
// uses it to mint the ID token that our backend verifies via NextAuth.
// The separate Android-type OAuth client in GCP (package name +
// SHA-1 fingerprint) is what authenticates the *caller*; the Web
// client ID is what authenticates the *token audience*.
// See docs/google-cloud-console-android-oauth.md.
const GOOGLE_ANDROID_WEB_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID;

function requireGoogleClientId(value: string | undefined, platform: "iOS" | "Android"): string {
  const candidate = value?.trim();
  if (
    !candidate ||
    /todo|placeholder|replace[-_ ]?me/i.test(candidate) ||
    !/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(candidate)
  ) {
    throw new Error(`${platform} Google OAuth client ID is not configured.`);
  }
  return candidate;
}

// SocialLogin.initialize() is idempotent according to the plugin docs,
// but we still guard with a module-level flag so that repeated sign-in
// attempts within the same JS context don't re-walk the native init path.
let socialLoginInitialised = false;

async function ensureSocialLoginInitialised() {
  if (socialLoginInitialised) return;
  try {
    const ios = isCapacitorIOS();
    const googleClientId = ios
      ? requireGoogleClientId(GOOGLE_IOS_CLIENT_ID, "iOS")
      : requireGoogleClientId(GOOGLE_ANDROID_WEB_CLIENT_ID, "Android");
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    console.log("[oauth-native] SocialLogin.initialize starting", {
      hasApple: Boolean(APPLE_BUNDLE_ID),
      hasGoogleIos: Boolean(GOOGLE_IOS_CLIENT_ID),
      platform: isCapacitorIOS() ? "ios" : "android",
    });
    await SocialLogin.initialize({
      apple: { clientId: APPLE_BUNDLE_ID },
      google: ios
        ? { iOSClientId: googleClientId }
        : {
            // Android — capgo wants the Web-type OAuth client ID here.
            // On Android, `webClientId` plays the same role as the
            // server-client-id elsewhere: it's the `aud` claim our
            // NextAuth backend verifies on the resulting Google ID token.
            // (The plugin's TypeScript surface does not expose a separate
            // `serverClientId` for Android — `webClientId` covers it.)
            webClientId: googleClientId,
          },
    });
    socialLoginInitialised = true;
    console.log("[oauth-native] SocialLogin.initialize OK");
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[oauth-native] SocialLogin.initialize FAILED", msg);
    if (typeof window !== "undefined") {
      window.alert(`Sign-in plugin failed to initialise:\n${msg}`);
    }
    throw err;
  }
}

/**
 * Sign in with an external OAuth provider.
 *
 * Web: identical to `next-auth/react#signIn(provider, options)`.
 *
 * iOS Capacitor:
 *   - Apple → native ASAuthorizationController via capgo plugin + token exchange.
 *   - Google → native Google sign-in sheet via capgo plugin + token exchange.
 *
 * Android Capacitor:
 *   - Google → native Google Sign-In sheet via capgo plugin + token exchange.
 *   - Apple → capgo's web fallback (Sign in with Apple JS); Play reviewers
 *     accept this pattern, since Apple-as-IdP on Android is not required.
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  options?: SignInOptions,
): Promise<void> {
  const callbackUrl = safeCallbackUrl(options?.callbackUrl);
  const safeOptions = { ...options, callbackUrl };

  if (!isCapacitorIOS() && !isCapacitorAndroid()) {
    // NextAuth's OAuth callback decodes the existing JWT before resolving the
    // selected provider account. Clear it first so a user can switch accounts
    // from /login without triggering OAuthAccountNotLinked.
    await signOut({ redirect: false });
    await signIn(provider, safeOptions);
    return;
  }

  // Native branch — capgo SocialLogin handles per-platform internals.
  await ensureSocialLoginInitialised();
  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  // Server-issued, single-use challenge. The provider signs its binding and
  // the exchange consumes it atomically before minting a session.
  const nonceResponse = await fetch("/api/auth/native-nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
  if (!nonceResponse.ok) throw new Error("Could not start native sign-in securely");
  const nonceBody = (await nonceResponse.json()) as { nonce?: string };
  const noncePlaintext = nonceBody.nonce;
  if (!noncePlaintext) throw new Error("Native sign-in challenge was missing");

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
    const errName = err instanceof Error ? err.name : "Unknown";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[oauth-native] ${provider} SocialLogin.login FAILED`, {
      name: errName,
      message: errMsg,
    });
    // Surface to a visible alert for native debugging (toast may be clipped
    // off-screen by iOS safe-area). Cancellation messages are passed through
    // as-is — the user-visible alert helps when the failure is genuine.
    if (typeof window !== "undefined" && !/cancel/i.test(errMsg)) {
      window.alert(`${provider} sign-in failed:\n${errName}: ${errMsg}`);
    }
    const msg = err instanceof Error ? err.message : `${provider} sign-in was cancelled.`;
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
  if (typeof window !== "undefined") {
    window.location.href = callbackUrl;
  }
}
