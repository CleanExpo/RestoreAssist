/**
 * RA-1581 — public status surface.
 *
 * Shallow server-rendered page that hits `/api/health` on load so
 * procurement / ops can see live uptime + DB reachability without
 * signing in. Does not replace a dedicated incident-history page; when
 * the team adopts Statuspage/Instatus/Atlassian this route should
 * either redirect or render an embed.
 *
 * Deliberately zero-dependency: any import that pulls React Query,
 * Prisma, or auth bloats this page and defeats the purpose of a
 * heart-beat surface that must be fast + reliable.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Status · RestoreAssist",
  description:
    "Live status of RestoreAssist platform services — API, database, background jobs.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HealthCheck {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, HealthCheck>;
}

async function fetchHealth(): Promise<HealthResponse | null> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  const url = base.startsWith("http") ? `${base}/api/health` : `https://${base}/api/health`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

function toneFor(status: string): { label: string; tint: string } {
  switch (status) {
    case "ok":
      return { label: "Operational", tint: "bg-emerald-100 text-emerald-800" };
    case "degraded":
      return { label: "Degraded", tint: "bg-amber-100 text-amber-800" };
    default:
      return { label: "Outage", tint: "bg-rose-100 text-rose-800" };
  }
}

export default async function StatusPage() {
  const health = await fetchHealth();
  const overall = health?.status ?? "error";
  const tone = toneFor(overall);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
        System Status
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Live platform health for RestoreAssist. This page reflects the last
        fifteen seconds of data.
      </p>

      <div
        role="status"
        aria-live="polite"
        className={`mt-8 rounded-2xl border border-slate-200 p-6 dark:border-slate-700 ${tone.tint}`}
      >
        <div className="text-2xl font-semibold">{tone.label}</div>
        <div className="mt-1 text-sm opacity-80">
          {health
            ? `Measured at ${new Date(health.timestamp).toLocaleString("en-AU")}`
            : "Health endpoint unreachable from the public edge. This is typically a transient Vercel region issue."}
        </div>
      </div>

      {health ? (
        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Component checks
          </h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
            {Object.entries(health.checks).map(([name, check]) => {
              const checkTone = toneFor(check.status);
              return (
                <li key={name} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {name}
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    {typeof check.latencyMs === "number" && (
                      <span className="text-slate-500">{check.latencyMs}ms</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 ${checkTone.tint}`}>
                      {checkTone.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-10 text-sm text-slate-600 dark:text-slate-300">
        <p>
          Report an incident you're seeing:{" "}
          <a
            href="mailto:support@restoreassist.app"
            className="font-medium underline hover:no-underline"
          >
            support@restoreassist.app
          </a>
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Historic incident log + RSS feed will land alongside the public
          Statuspage integration (tracked in Linear).
        </p>
      </section>
    </main>
  );
}
