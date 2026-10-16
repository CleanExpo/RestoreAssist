"use client";

import { useState } from "react";
import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";
import { ClientPortalShell } from "@/components/portal/ClientPortalShell";
import {
  clientPortalPanelPadding,
  clientPortalPrimaryLink,
} from "@/lib/portal/client-portal-theme";

export default function PortalRecoveryPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/portal/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : (data?.error?.message ?? "Enter a valid email address"),
        );
        return;
      }
      setResult(
        typeof data?.message === "string"
          ? data.message
          : "If a matching invitation exists, a new link is on its way.",
      );
    } catch {
      setError(
        "Something went wrong. Try again, or ask your restorer to resend.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClientPortalShell>
      <div className="mx-auto max-w-md space-y-6 py-4">
        <div className={clientPortalPanelPadding}>
          <h1 className="mb-2 text-2xl font-bold text-white">
            Recover client portal access
          </h1>
          <p className="mb-6 text-sm text-slate-400">
            Request a new invitation for a portal account. Job links from email
            are separate — ask your restorer for a fresh job link if that
            expired.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-200"
            >
              {error}
            </div>
          )}

          {result && (
            <div
              role="status"
              data-testid="portal-recovery-result"
              className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200"
            >
              {result}
            </div>
          )}

          <form method="post" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="portal-recovery-email"
                className="mb-1 block text-sm font-medium text-slate-200"
              >
                Email on the invitation
              </label>
              <input
                id="portal-recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-4 py-2.5 text-slate-100 focus:border-cyan-400/40 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className={`${clientPortalPrimaryLink} w-full disabled:opacity-50`}
            >
              {submitting ? "Sending…" : "Request a new invite"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-400">
            <Link
              href={PORTAL_PATHS.login}
              className="text-cyan-400/90 hover:underline"
            >
              Sign in
            </Link>
            <span className="px-2 text-slate-600">·</span>
            <Link
              href={PORTAL_PATHS.help}
              className="text-cyan-400/90 hover:underline"
            >
              Client help
            </Link>
          </p>
        </div>
        <PortalAccessExplainer compact />
      </div>
    </ClientPortalShell>
  );
}
