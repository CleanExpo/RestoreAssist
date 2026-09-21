"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { storeClientToken } from "@/lib/portal/client-session";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.token) {
        const message =
          data?.error ?? "Invalid email or password";
        setError(message);
        toast.error(message);
        return;
      }

      storeClientToken(data.token);
      toast.success("Welcome back!");
      router.push("/portal");
    } catch {
      setError("An error occurred. Please try again.");
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-cloud px-4 py-12">
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
            Client Portal
          </h1>
          <p className="text-brand-slate text-sm">
            Sign in to view your restoration projects
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="portal-email"
              className="block text-sm font-medium text-brand-navy mb-1"
            >
              Email
            </label>
            <input
              id="portal-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="portal-password"
              className="block text-sm font-medium text-brand-navy mb-1"
            >
              Password
            </label>
            <input
              id="portal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze focus:border-transparent"
              placeholder="••••••••"
            />
            <div className="mt-1 text-right">
              <Link
                href={PORTAL_PATHS.recovery}
                className="text-xs text-brand-cta hover:underline"
              >
                Cannot sign in? Request a new invite
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-bronze text-white rounded-lg font-medium hover:bg-brand-bronze/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-brand-slate">
            No portal account yet? Ask the restoration contractor for an
            invitation, or{" "}
            <Link
              href={PORTAL_PATHS.recovery}
              className="text-brand-cta hover:underline"
            >
              request a new invite
            </Link>
            .
          </p>
          <Link
            href={PORTAL_PATHS.help}
            className="block text-sm text-brand-cta hover:underline"
          >
            Client help — reports, approvals, invoices
          </Link>
        </div>
      </motion.div>
      <div className="max-w-md w-full mt-6">
        <PortalAccessExplainer compact />
      </div>
    </div>
  );
}
