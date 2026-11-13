"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { storeClientToken } from "@/lib/portal/client-session";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import {
  clientPortalEyebrow,
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

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
        const message = data?.error ?? "Invalid email or password";
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
    <ClientPortalShell>
      <div className="mx-auto flex max-w-md flex-col gap-6 py-4">
        <div className="text-center">
          <p className={clientPortalEyebrow}>Homeowner access</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Sign in to your portal
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            View reports and projects your restorer shared with you. If you
            received a one-time link by email, open that link directly — no
            password required.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={clientPortalPanelPadding}
        >
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-200"
            >
              {error}
            </div>
          )}

          <form method="post" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="portal-email"
                className="mb-1 block text-sm font-medium text-slate-200"
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
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="portal-password"
                className="mb-1 block text-sm font-medium text-slate-200"
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
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                placeholder="••••••••"
              />
              <div className="mt-1 text-right">
                <Link
                  href={PORTAL_PATHS.recovery}
                  className="text-xs text-cyan-400/90 hover:text-cyan-300 hover:underline"
                >
                  Cannot sign in? Request a new invite
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`${clientPortalPrimaryLink} w-full disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center">
            <p className="text-sm text-slate-400">
              No portal account yet? Ask your restoration contractor for an
              invitation, or{" "}
              <Link
                href={PORTAL_PATHS.recovery}
                className="text-cyan-400/90 hover:underline"
              >
                request a new invite
              </Link>
              .
            </p>
            <Link
              href={PORTAL_PATHS.help}
              className="block text-sm text-cyan-400/90 hover:underline"
            >
              Client help — reports, approvals, invoices
            </Link>
          </div>
        </motion.div>

        <PortalAccessExplainer compact />
      </div>
    </ClientPortalShell>
  );
}
