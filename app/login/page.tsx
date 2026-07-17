"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { signInWithOAuth } from "@/lib/oauth-native";
import { isCapacitorIOS } from "@/lib/capacitor";
import { useRouter, useSearchParams } from "next/navigation";
import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // RA-2073 — Sign in with Apple is now fully wired (see useEffect below).
  // The previous workaround that hid both third-party buttons on iOS for
  // the 1.0(4)..1.0(10) builds is no longer needed.
  const [authHydrated, setAuthHydrated] = useState(false);
  // Track whether we're inside the iOS Capacitor shell. Used to:
  //   1. Default rememberMe to true (field techs want a 90-day session).
  //   2. Show the Apple Sign-In button via the native plugin path even
  //      when NEXT_PUBLIC_APPLE_SIGNIN_ENABLED is unset — the env flag
  //      gates the web AppleProvider (which needs APPLE_CLIENT_ID +
  //      APPLE_CLIENT_SECRET) but the native plugin only needs the
  //      bundle ID and verifies the JWT via Apple's JWKS directly.
  const [isIOS, setIsIOS] = useState(false);
  // RA-2076 (1.0.4) — Continue with Google is now native on iOS (via the
  // capgo plugin), so the 1.0.3 hide-on-iOS gate is removed. Apple
  // guideline 4.8 still satisfied because Apple Sign-In is shown as a
  // peer button.
  // RA-1587 — 2FA state. `totp` is the 6-digit code; `needsTotp` is
  // toggled true after the server bounces the first submission with
  // `2FA_REQUIRED`. We keep `email` + `password` in state so the
  // follow-up submission carries them without re-prompting.
  const [totp, setTotp] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  // RA-2074 — "Stay signed in" toggle. Defaults true on iOS shell
  // (field technicians want long-lived sessions on company devices),
  // false on web (shared browsers + better default for least-privilege).
  // The actual default is set in the iOS-detect effect below so SSR
  // hydration matches.
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();

  // Pre-fill email if coming from signup
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  // RA-2073 — Sign in with Apple is now fully wired (Phase 2 complete:
  // Services ID `com.restoreassist.signin`, .p8 key, JWT secret in Vercel,
  // Universal Links AASA file with team prefix `L3TJL6HUJ7.com.restoreassist.app`).
  // Both Continue with Google and Continue with Apple are now safe to show
  // on the iOS Capacitor shell. Apple guideline 4.8 is satisfied because
  // SiwA is a peer button to Google. The associated-domains entitlement
  // (`applinks:restoreassist.app`) ships in the same TestFlight build so
  // SFSafariViewController hands the OAuth callback back to the WebView
  // with cookies attached.
  useEffect(() => {
    const onIos = isCapacitorIOS();
    setAuthHydrated(true);
    setIsIOS(onIos);
    // RA-2074 — default rememberMe TRUE on iOS shell so field techs
    // get a 90-day session by default. Web users opt in via checkbox.
    setRememberMe(onIos);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        totp: totp || undefined,
        // RA-2074 — forward "Stay signed in" to the server. CredentialsProvider
        // reads this and stamps a 90-day customExp instead of 7-day.
        rememberMe: rememberMe ? "true" : "false",
        redirect: false,
      });

      if (result?.error === "2FA_REQUIRED") {
        // Account has 2FA enabled. Reveal the TOTP field and ask for a code.
        setNeedsTotp(true);
        setError("Enter your 6-digit authenticator code to continue.");
        toast("2FA code required");
      } else if (result?.error === "2FA_INVALID") {
        setNeedsTotp(true);
        setError("Invalid authenticator code. Try again.");
        toast.error("Invalid 2FA code");
      } else if (result?.error?.startsWith("ACCOUNT_LOCKED:")) {
        // RA-1590 — too many failures in the rolling window. Show the
        // retry window so the user knows when to come back.
        const secs = Number(result.error.split(":")[1]) || 900;
        const mins = Math.max(1, Math.ceil(secs / 60));
        const msg = `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.`;
        setError(msg);
        toast.error(msg);
      } else if (result?.error) {
        setError("Invalid email or password");
        toast.error("Invalid email or password");
      } else {
        // Check if user needs to change password
        const session = await getSession();
        if (session?.user?.mustChangePassword) {
          toast.success("Login successful! Please change your password.");
          router.push("/dashboard/change-password");
        } else {
          // P1 #16 — honour `?callbackUrl=` from middleware-driven login
          // redirects, validated against the same-origin allowlist so an
          // attacker cannot weaponise the login flow into an open redirect.
          const target = safeCallbackUrl(searchParams.get("callbackUrl"));
          toast.success("Login successful! Welcome back!");
          router.push(target);
        }
      }
    } catch (error) {
      setError("An error occurred. Please try again.");
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");
    try {
      const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
      // RA-1842 Ground 3 — on iOS this opens SFSafariViewController
      // instead of bouncing to Safari proper. Web behaviour unchanged.
      await signInWithOAuth("google", { callbackUrl });
    } catch (error: any) {
      setError("Google sign-in failed. Please try again.");
      toast.error("Google sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  // RA-1842 Ground 2 — Sign in with Apple (Apple guideline 4.8).
  // Required by App Review because the app offers third-party login.
  // Same iOS-aware wrapper as Google handler — uses
  // SFSafariViewController on iOS, full-page redirect on web.
  const handleAppleSignIn = async () => {
    setIsLoading(true);
    setError("");
    try {
      const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
      await signInWithOAuth("apple", { callbackUrl });
    } catch (error: any) {
      setError("Apple sign-in failed. Please try again.");
      toast.error("Apple sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 1, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.h1
            className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2"
            style={{ fontFamily: "Titillium Web, sans-serif" }}
          >
            RestoreAssist{" "}
          </motion.h1>
          <p className="text-slate-400">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <motion.div
          initial={{ opacity: 1, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8"
        >
          <form
            onSubmit={handleSubmit}
            className="space-y-6"
            // 1.0.4 (RA-2076): on (was off) so iOS native AutoFill / iCloud
            // Keychain offers to save the username + password after a
            // successful sign-in, and pre-fills both fields on subsequent
            // visits. AASA already declares the `webcredentials` block for
            // restoreassist.app, so the iOS app shell shares its credential
            // entries with Safari / other devices on the same iCloud account.
            autoComplete="on"
          >
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={20}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                />
                <input
                  id="email"
                  type="email"
                  name="email"
                  // 1.0.4 (RA-2076): "username" pairs with "current-password"
                  // on the password field to mark this as a sign-in form. iOS
                  // AutoFill recognises that pair and offers Save / Use Saved
                  // Password. "off" suppressed those prompts entirely.
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  size={20}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  // 1.0.4 (RA-2076): "current-password" — this is a sign-in
                  // form, not a registration form (the latter would use
                  // "new-password"). iOS AutoFill needs this to offer Save
                  // Password / Use Saved Password.
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-300"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* RA-1587 / RA-1588 — 2FA code OR recovery code. Only
                rendered after the server signals the account has 2FA
                enabled (prevents enumeration). Accepts either:
                  - 6-digit TOTP from the authenticator app, OR
                  - XXXXX-XXXXX single-use recovery code. */}
            {needsTotp && (
              <div>
                <label
                  htmlFor="totp"
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  6-digit code or recovery code
                </label>
                <input
                  id="totp"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  maxLength={16}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.slice(0, 16))}
                  placeholder="123456 or ABCDE-FGHIJ"
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 tracking-widest text-center text-lg"
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-2">
                  Lost your device? Enter one of the recovery codes you saved
                  when you enabled 2FA. Each is single-use.
                </p>
              </div>
            )}

            {/* RA-2074 — "Stay signed in" toggle. Defaults true inside
                the iOS Capacitor shell so field technicians get a
                90-day session and don't re-auth between shifts.
                Defaults false on web — shared-browser hygiene. */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="rememberMe"
                className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none"
              >
                <input
                  id="rememberMe"
                  name="rememberMe"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-700 text-cyan-500 focus:ring-2 focus:ring-cyan-500/50"
                />
                Stay signed in
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ fontFamily: "Titillium Web, sans-serif" }}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight size={20} />
                </>
              )}
            </motion.button>
          </form>

          {/* Third-party auth (Google + Apple). Always rendered now that
              SiwA is wired end-to-end (RA-2073). The previous iOS gate
              has been removed; both buttons show on web AND in the iOS
              Capacitor shell. */}
          {/* Divider */}
          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-slate-600/50" />
            <span className="px-4 text-slate-400 text-sm">or</span>
            <div className="flex-1 border-t border-slate-600/50" />
          </div>

          {/* Google Sign In — 1.0.4 (RA-2076) re-enables this on iOS via
              the @capgo/capacitor-social-login native plugin (same one
              that backs Apple). Web behaviour unchanged. */}
          <motion.button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 bg-white/10 border border-slate-600/50 rounded-xl font-medium text-white hover:bg-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ fontFamily: "Titillium Web, sans-serif" }}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </motion.button>

          {/* Sign in with Apple. Apple guideline 4.8 requires this option
              whenever a third-party login is offered. Shown when:
                - iOS Capacitor shell: native plugin verifies the JWT via
                  Apple's JWKS — no Service ID + .p8 secret needed
                  server-side. The flow stays inside WKWebView so cookies
                  land where the dashboard middleware reads them.
                - Web: requires NEXT_PUBLIC_APPLE_SIGNIN_ENABLED=true AND
                  APPLE_CLIENT_ID + APPLE_CLIENT_SECRET configured for the
                  NextAuth AppleProvider. */}
          {(isIOS ||
            process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED === "true") && (
            <motion.button
              onClick={handleAppleSignIn}
              disabled={isLoading}
              className="mt-3 w-full py-3 bg-black/80 border border-slate-600/50 rounded-xl font-medium text-white hover:bg-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ fontFamily: "Titillium Web, sans-serif" }}
              aria-label="Continue with Apple"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M17.05 20.28c-.98.95-2.05.86-3.08.43-1.09-.46-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.42C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  Continue with Apple
                </>
              )}
            </motion.button>
          )}

          {/* Forgot Password & Sign Up Links */}
          <div className="mt-6 space-y-3 text-center">
            <div>
              <Link
                href="/forgot-password"
                className="text-cyan-400 hover:text-cyan-300 transition-colors text-sm font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <div>
              <p className="text-slate-400">
                Don't have an account?{" "}
                <Link
                  href="/signup"
                  className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                >
                  Sign up for free
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
