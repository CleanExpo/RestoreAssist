/**
 * Override Governance — Admin
 *
 * Route: /dashboard/governance
 * Auth:  ADMIN role required (server-side redirect)
 *
 * RA-1390 / Motion M-15 board surface. Shows the monthly SOFT-gap
 * override-rate roll-up. Breaches (>5%) flag for re-classification.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGate } from "@/lib/progress/gate-policy";

export const metadata = {
  title: "Override Governance — Admin | RestoreAssist",
  description: "M-15 monthly override-rate review (5% safeguard).",
};

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function GovernancePage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if ((session.user as { role?: string }).role !== "ADMIN") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const requestedMonth = parseYearMonth(params.month);

  // Distinct months for the picker — last 24 months recorded.
  const monthRows = await prisma.overrideGovernanceReport.findMany({
    distinct: ["reportMonth"],
    select: { reportMonth: true },
    orderBy: { reportMonth: "desc" },
    take: 24,
  });
  const months = monthRows.map((r) => r.reportMonth);
  const currentMonth = requestedMonth ?? months[0] ?? null;

  const reports = currentMonth
    ? await prisma.overrideGovernanceReport.findMany({
        where: { reportMonth: currentMonth },
        orderBy: [{ isBreached: "desc" }, { overrideRate: "desc" }],
      })
    : [];

  const breachCount = reports.filter((r) => r.isBreached).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Override Governance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          M-15 5% safeguard · RA-1390. Gates with override-rate &gt; 5% surface
          to the board for re-classification.
        </p>
      </header>

      <section className="flex gap-4 flex-wrap">
        <SummaryCard label="Reporting month" value={fmtMonth(currentMonth)} />
        <SummaryCard label="Gates tracked" value={String(reports.length)} />
        <SummaryCard
          label="Breaches"
          value={String(breachCount)}
          warning={breachCount > 0}
        />
      </section>

      {months.length > 1 ? (
        <nav className="flex flex-wrap gap-2 text-sm">
          {months.map((m) => {
            const key = m.toISOString().slice(0, 7);
            const active =
              currentMonth?.toISOString().slice(0, 7) === key;
            return (
              <a
                key={key}
                href={`/dashboard/governance?month=${key}`}
                className={`px-2 py-1 rounded border ${
                  active ? "bg-foreground text-background" : "bg-background"
                }`}
              >
                {key}
              </a>
            );
          })}
        </nav>
      ) : null}

      {reports.length === 0 ? (
        <div className="rounded border p-6 text-sm text-muted-foreground">
          No override-governance reports yet for this month. The cron
          populates this on the 1st of each month from
          ProgressTransition.softGaps (M-14). Until M-14 SOFT-gap reporting
          flows through real transitions, this surface stays empty.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Gate</th>
                <th className="px-4 py-2 text-right">Transitions</th>
                <th className="px-4 py-2 text-right">Overrides</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const entry = getGate(r.gateKey);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium">
                        {entry?.label ?? r.gateKey}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.gateKey}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.transitionCount}
                    </td>
                    <td className="px-4 py-2 text-right">{r.overrideCount}</td>
                    <td className="px-4 py-2 text-right">
                      {(r.overrideRate * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2">
                      {r.isBreached ? (
                        <span className="inline-block rounded px-2 py-0.5 text-xs bg-amber-100 text-amber-800">
                          Breach
                        </span>
                      ) : (
                        <span className="inline-block rounded px-2 py-0.5 text-xs bg-emerald-100 text-emerald-800">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md border p-4 min-w-[140px]">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-2xl font-semibold mt-1 ${warning ? "text-amber-600" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function parseYearMonth(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

function fmtMonth(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 7);
}
