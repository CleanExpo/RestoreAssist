"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTutorialsForDbType,
  type DbType,
} from "@/lib/learn/db-tutorials";
import {
  validateConnectionString,
  hostFromConnectionString,
} from "@/lib/tenant/onboarding-helpers";

/**
 * DatabaseCard — cutover onboarding, gate G1 (guided flow).
 *
 * The sticky-free, non-technical path to connecting a client's own database:
 * pick your DB type → follow the matching setup tutorial → paste the connection
 * string (validated inline) → confirm the target host → connect. The mutating
 * step (which kicks off provisioning + migration) is gated behind an explicit
 * confirm. No LLM tool-execution — that's a later experiment (RA-6875).
 */
type Phase = "idle" | "confirm" | "submitting" | "provisioning" | "error";

const DB_TYPES: { key: DbType; label: string }[] = [
  { key: "supabase", label: "Supabase" },
  { key: "neon", label: "Neon" },
  { key: "aws-rds", label: "AWS RDS" },
  { key: "self-hosted", label: "Self-hosted" },
];

export function DatabaseCard() {
  const [dbType, setDbType] = useState<DbType>("supabase");
  const [connectionString, setConnectionString] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const trimmed = connectionString.trim();
  const validation = trimmed ? validateConnectionString(trimmed) : { ok: false };
  const host = hostFromConnectionString(trimmed);
  const tutorials = getTutorialsForDbType(dbType);

  const submit = async () => {
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/onboarding/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, dbType }),
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
            className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-3 text-sm"
          >
            Connecting <strong>{host}</strong> — your customer data will live in{" "}
            <strong>your own database</strong>. We&apos;ll confirm once it&apos;s
            isolated and ready.
          </div>
        ) : phase === "confirm" ? (
          <div className="space-y-3 text-sm">
            <p>
              You&apos;re about to connect to <strong>{host}</strong> and set it
              up as your database. This runs the initial setup on it.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submit}
                className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 transition-colors"
              >
                Confirm &amp; connect
              </button>
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="rounded-lg border border-neutral-300 dark:border-slate-700 px-3 py-1.5 text-sm"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500 dark:text-slate-400">
              Bring your own PostgreSQL database so your customers and claims stay
              isolated in infrastructure you control.
            </p>

            {/* DB-type selector */}
            <div className="flex flex-wrap gap-1.5">
              {DB_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={dbType === t.key}
                  onClick={() => setDbType(t.key)}
                  className={
                    "rounded-lg border px-2.5 py-1 text-xs transition-colors " +
                    (dbType === t.key
                      ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                      : "border-neutral-300 dark:border-slate-700 text-neutral-600 dark:text-slate-300")
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Setup tutorial for the chosen type */}
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              How to get your connection string:{" "}
              {tutorials.map((tut) => (
                <a
                  key={tut.url}
                  href={tut.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-600 dark:text-cyan-400 underline"
                >
                  {tut.title} ({tut.source})
                </a>
              ))}
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

            {/* Inline validation feedback */}
            {trimmed && !validation.ok && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {validation.error}
              </p>
            )}

            <button
              type="button"
              onClick={() => setPhase("confirm")}
              disabled={!validation.ok}
              className="inline-flex items-center rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Connect
            </button>

            {phase === "error" && error && (
              <div
                role="alert"
                className="rounded-lg bg-destructive-subtle text-destructive-subtle-foreground p-2 text-xs"
              >
                {error}{" "}
                <button
                  type="button"
                  onClick={() => setPhase("confirm")}
                  className="underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
