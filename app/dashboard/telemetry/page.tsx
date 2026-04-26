/**
 * Progress Telemetry — Admin
 *
 * Route: /dashboard/telemetry
 * Auth:  ADMIN role required (server-side redirect)
 *
 * RA-1392 / Motion M-17 board surface — 4 funnels + 2 KPIs computed off
 * ProgressTelemetryEvent. Server-rendered; no client-side fetch needed.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeAllFunnels, type FunnelStat } from "@/lib/telemetry/funnels";
import { computeOverrideRate, computeTimeToInvoice } from "@/lib/telemetry/kpis";

export const metadata = {
  title: "Progress Telemetry — Admin | RestoreAssist",
  description: "M-17 progress framework funnels and KPIs.",
};

// Always server-render fresh; this is admin-only and traffic is low.
export const dynamic = "force-dynamic";

export default async function ProgressTelemetryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [funnels, timeToInvoice, overrideRate] = await Promise.all([
    computeAllFunnels(),
    computeTimeToInvoice(),
    computeOverrideRate(),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Progress Telemetry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last 30 days · M-17 ship-blocker (RA-1392)
        </p>
      </header>

      <section>
        <h2 className="text-lg font-medium mb-3">KPIs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard
            title="Time to invoice (median)"
            value={
              timeToInvoice.medianHours === null
                ? "—"
                : `${timeToInvoice.medianHours.toFixed(1)} h`
            }
            subtitle={`${timeToInvoice.sampleCount} sample${timeToInvoice.sampleCount === 1 ? "" : "s"}`}
          />
          <KpiCard
            title="Override rate"
            value={`${(overrideRate.rate * 100).toFixed(1)}%`}
            subtitle={`${overrideRate.overrides} overrides / ${overrideRate.blocked} blocked`}
            warning={overrideRate.rate > 0.05}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Funnels</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Funnel</th>
                <th className="px-4 py-2 text-left">Transition key</th>
                <th className="px-4 py-2 text-right">Attempts</th>
                <th className="px-4 py-2 text-right">Successes</th>
                <th className="px-4 py-2 text-right">Blocked</th>
                <th className="px-4 py-2 text-right">Success rate</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((f) => (
                <FunnelRow key={f.funnel} f={f} />
              ))}
            </tbody>
          </table>
        </div>
        {funnels.every((f) => f.attempts === 0) ? (
          <p className="text-xs text-muted-foreground mt-3">
            No telemetry events recorded yet in the last 30 days. The
            ProgressTelemetryEvent table populates as the M-17 emitters fire on
            real claim transitions. M-15 governance reports depend on this feed.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  warning = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p
        className={`text-2xl font-semibold mt-1 ${warning ? "text-amber-600" : ""}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function FunnelRow({ f }: { f: FunnelStat }) {
  return (
    <tr className="border-t">
      <td className="px-4 py-2 capitalize">{f.funnel}</td>
      <td className="px-4 py-2 font-mono text-xs">{f.transitionKey}</td>
      <td className="px-4 py-2 text-right">{f.attempts}</td>
      <td className="px-4 py-2 text-right">{f.successes}</td>
      <td className="px-4 py-2 text-right">{f.blocked}</td>
      <td className="px-4 py-2 text-right">
        {f.attempts === 0 ? "—" : `${(f.successRate * 100).toFixed(1)}%`}
      </td>
    </tr>
  );
}

