"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * DatabaseCard — cutover onboarding (gate G1).
 *
 * Lets a workspace owner connect their own CRM database. v1 ships the
 * bring-your-own connection-string path (provision-for-me is stubbed until a
 * managed-Postgres provider is chosen). On submit it POSTs to
 * /api/onboarding/database, which validates + encrypts + records the string and
 * marks the workspace `provisioning`; the connectivity test + migration + flip to
 * ready run in the provisioning worker.
 */
type Phase = "idle" | "submitting" | "provisioning" | "error";

export function DatabaseCard() {
  const [connectionString, setConnectionString] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    if (!connectionString.trim() || phase === "submitting") return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/onboarding/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString }),
      });
      if (res.status === 202) {
        setPhase("provisioning");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not connect your database.");
      setPhase("error");
    } catch {
      setError("Request failed — check your connection and try again.");
      setPhase("error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your database</CardTitle>
      </CardHeader>
      <CardContent>
        {phase === "provisioning" ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-3 text-sm"
          >
            <span>
              Connecting your database — your customer data will live in{" "}
              <strong>your own database</strong>. We&apos;ll confirm once it&apos;s
              isolated and ready.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 dark:text-slate-400">
              Bring your own PostgreSQL database so your customers and claims stay
              isolated in infrastructure you control.
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600 dark:text-slate-300">
                Connection string
              </span>
              <input
                type="password"
                aria-label="Database connection string"
                placeholder="postgres://user:password@host:5432/database"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={connect}
              disabled={phase === "submitting" || !connectionString.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {phase === "submitting" ? "Connecting…" : "Connect"}
            </button>
            {phase === "error" && error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-destructive-subtle text-destructive-subtle-foreground p-2 text-xs"
              >
                {error}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
