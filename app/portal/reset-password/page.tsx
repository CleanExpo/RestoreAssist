"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { storeClientToken } from "@/lib/portal/client-session";

type Step = "email" | "code" | "password";

export default function PortalResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/portal/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error ?? "Something went wrong. Please try again.";
        setError(message);
        return;
      }

      setStep("code");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit verification code from your email.");
      return;
    }
    setStep("password");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password must be at least 12 characters long");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/portal/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password, confirmPassword }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.token) {
        const message = data?.error ?? "Failed to reset password";
        setError(message);
        toast.error(message);
        return;
      }

      storeClientToken(data.token);
      toast.success("Password updated — you're signed in");
      router.push("/portal");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cloud px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-lg shadow-lg p-8"
      >
        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt="RestoreAssist"
            width={80}
            height={80}
            className="mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-brand-navy mb-2">
            Reset Password
          </h1>
          <p className="text-brand-slate text-sm">
            {step === "email"
              ? "Enter the email address on your portal account"
            : step === "code"
              ? "Enter the verification code from your email"
              : `Set a new password for ${email}`}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-destructive-subtle border border-destructive-subtle-foreground/30 rounded-lg text-destructive-subtle-foreground text-sm"
          >
            {error}
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={handleCheckEmail} className="space-y-4">
            <div>
              <label
                htmlFor="reset-email"
                className="block text-sm font-medium text-brand-navy mb-1"
              >
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-bronze text-white rounded-lg font-medium hover:bg-brand-bronze/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        ) : step === "code" ? (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="reset-code"
                className="block text-sm font-medium text-brand-navy mb-1"
              >
                Verification code
              </label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                autoComplete="one-time-code"
                className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
                placeholder="6-digit code"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-brand-bronze text-white rounded-lg font-medium hover:bg-brand-bronze/90 transition-colors"
            >
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label
                htmlFor="reset-password"
                className="block text-sm font-medium text-brand-navy mb-1"
              >
                New Password
              </label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
                placeholder="At least 12 characters"
              />
              <p className="text-xs text-brand-slate mt-1">
                Minimum 12 characters
              </p>
            </div>

            <div>
              <label
                htmlFor="reset-confirm"
                className="block text-sm font-medium text-brand-navy mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="reset-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                autoComplete="new-password"
                className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
                placeholder="Re-enter new password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-bronze text-white rounded-lg font-medium hover:bg-brand-bronze/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Updating..." : "Set New Password"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setPassword("");
                setConfirmPassword("");
                setError("");
              }}
              className="w-full py-2 text-sm text-brand-slate hover:text-brand-navy transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/portal/login"
            className="text-sm text-brand-bronze hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
