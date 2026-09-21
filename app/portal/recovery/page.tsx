"use client";

import { useState } from "react";
import Link from "next/link";
import { PORTAL_PATHS } from "@/lib/portal/recovery-paths";
import { PortalAccessExplainer } from "@/components/portal/PortalAccessExplainer";

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
            : data?.error?.message ?? "Enter a valid email address",
        );
        return;
      }
      setResult(
        typeof data?.message === "string"
          ? data.message
          : "If a matching invitation exists, a new link is on its way.",
      );
    } catch {
      setError("Something went wrong. Try again, or ask the contractor to resend.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-brand-cloud px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-brand-navy mb-2">
            Recover client portal access
          </h1>
          <p className="text-sm text-brand-slate mb-6">
            Request a new invitation for a portal account. Job links are
            separate — ask the contractor for a fresh job link if that is what
            expired. Password reset is not self-serve.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 bg-destructive-subtle border border-destructive-subtle-foreground/30 rounded-lg text-destructive-subtle-foreground text-sm"
            >
              {error}
            </div>
          )}

          {result && (
            <div
              role="status"
              data-testid="portal-recovery-result"
              className="mb-4 p-3 bg-success-subtle text-success-subtle-foreground rounded-lg text-sm"
            >
              {result}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="portal-recovery-email"
                className="block text-sm font-medium text-brand-navy mb-1"
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
                className="w-full px-4 py-2 border border-brand-slate/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-bronze"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-11 py-3 bg-brand-cta text-white rounded-lg font-medium hover:bg-brand-cta/90 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Request a new invite"}
            </button>
          </form>

          <p className="mt-6 text-sm text-brand-slate">
            <Link href={PORTAL_PATHS.login} className="text-brand-cta hover:underline">
              Sign in
            </Link>
            <span className="px-2 text-brand-slate/50">·</span>
            <Link href={PORTAL_PATHS.help} className="text-brand-cta hover:underline">
              Client help
            </Link>
          </p>
        </div>
        <PortalAccessExplainer compact />
      </div>
    </main>
  );
}
