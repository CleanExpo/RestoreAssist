"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toCsv, type CsvCell } from "@/lib/csv/csv-cell";
import { formatMoney } from "@/lib/locale/format";
import type { RevenueLeakageReport as Report } from "@/lib/analytics/revenue-leakage";
import type { CategoryLeakageReport } from "@/lib/analytics/equipment-category";
import { ADVANCED_WORKSPACE_EYEBROW } from "@/lib/dashboard/simple-dashboard-theme";
import { DashboardListPageHeader } from "@/app/dashboard/components/DashboardListPageHeader";
import { DashboardPageFrame } from "@/app/dashboard/components/DashboardPageFrame";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "@/app/dashboard/components/DashboardPanel";

/**
 * RA-8598 — screen for GET /api/analytics/revenue-leakage (RA-7026).
 * Every state is explicit: a failed load is an error, never an empty report,
 * and "not connected" is never shown as a zero result.
 */

type LeakageResponse =
  | { connected: false; message?: string }
  | {
      connected: true;
      totalJobsImported: number | null;
      lastSyncAt: string | null;
      truncated: boolean;
      benchmarkPartsLoaded: number;
      report: Report;
      categoryLeakage: CategoryLeakageReport;
    };

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: LeakageResponse };

/** Ascora and the benchmark are Australian dollars, ex GST. */
const aud = (dollars: number) => formatMoney(Math.round(dollars * 100), "AU");
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

const CATEGORY_LABELS: Record<string, string> = {
  labour_tech: "Technician labour",
  labour_senior: "Senior labour",
  airmover: "Air movers",
  dehumidifier: "Dehumidifiers",
  afd: "Air filtration (AFD)",
  passthrough: "Pass-through costs",
  other: "Other",
};

/** The rows on screen (claim types, then parts) as a CSV document. */
export function leakageCsv(report: Report): string {
  const rows: CsvCell[][] = [
    ["Section", "Claim type", "Part number", "Description", "Jobs or lines", "Quantity", "Actual ex GST", "Benchmark ex GST", "Leakage ex GST", "Leakage %"],
  ];
  for (const c of report.byClaimType) {
    rows.push(["Claim type", c.claimType, null, null, c.jobCount, null, c.actualExTax.toFixed(2), c.benchmarkExTax.toFixed(2), c.leakage.toFixed(2), (c.leakagePct * 100).toFixed(1)]);
  }
  for (const p of report.topUnderpricedParts) {
    rows.push(["Under-priced part", null, p.partNumber, p.description, p.lineCount, p.totalQuantity, p.actualAvgUnitPrice.toFixed(2), p.benchmarkUnitPrice.toFixed(2), p.totalGap.toFixed(2), null]);
  }
  return toCsv(rows, "\r\n");
}

function downloadCsv(report: Report) {
  const blob = new Blob([leakageCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "revenue-leakage.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function RevenueLeakageReport() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/analytics/revenue-leakage", { cache: "no-store" });
      if (!res.ok) throw new Error(`The report could not be loaded (${res.status}).`);
      const data = (await res.json()) as LeakageResponse;
      if (typeof data?.connected !== "boolean") {
        throw new Error("The report answer was not readable.");
      }
      setState({ kind: "ready", data });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "The report could not be loaded.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardPageFrame className="w-full space-y-6 pb-10 pt-2">
      <DashboardListPageHeader
        eyebrow={ADVANCED_WORKSPACE_EYEBROW}
        title="Revenue leakage"
        description="Money left on the table: your invoiced Ascora line items compared with benchmark rates."
        secondaryLinks={[{ href: "/dashboard/analytics", label: "Back to Analytics" }]}
      />
      <Body state={state} onRetry={load} />
    </DashboardPageFrame>
  );
}

function Body({ state, onRetry }: { state: State; onRetry: () => void }) {
  if (state.kind === "loading") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading revenue leakage">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
        <p className="text-sm font-medium text-destructive">
          Failed to load the revenue leakage report. {state.message}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  const data = state.data;
  if (!data.connected) {
    return (
      <DashboardPanel>
        <DashboardPanelHeader
          title="Ascora is not connected"
          description={data.message ?? "Connect Ascora and run a sync first."}
        />
        <p className="text-sm text-muted-foreground">
          This report reads your invoiced Ascora jobs. There is nothing to measure until they are imported.
        </p>
        <Link
          href="/dashboard/integrations"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          Connect Ascora
        </Link>
      </DashboardPanel>
    );
  }

  const { report, categoryLeakage } = data;
  return (
    <div className="space-y-6">
      {data.truncated ? (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          These figures cover the first 5,000 jobs only. Jobs beyond that are not included.
        </p>
      ) : null}

      <DashboardPanel>
        <DashboardPanelHeader
          title="Total leakage"
          description={`${report.jobsAnalyzed.toLocaleString("en-AU")} jobs, ${report.linesMatched.toLocaleString("en-AU")} of ${report.linesAnalyzed.toLocaleString("en-AU")} line items matched to a benchmark.`}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => downloadCsv(report)}>
              Download CSV
            </Button>
          }
        />
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Figure label="Left on the table (ex GST)" value={aud(report.totalLeakage)} />
          <Figure label="Share of benchmark value" value={pct(report.leakagePct)} />
          <Figure label="Invoiced on matched lines (ex GST)" value={aud(report.totalActualExTax)} />
        </dl>
      </DashboardPanel>

      <DashboardPanel>
        <DashboardPanelHeader title="By claim type" />
        {report.byClaimType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matched line items to group by claim type.</p>
        ) : (
          <Table
            caption="Leakage by claim type"
            head={["Claim type", "Jobs", "Actual", "Benchmark", "Leakage", "Leakage %"]}
            rows={report.byClaimType.map((c) => [c.claimType, String(c.jobCount), aud(c.actualExTax), aud(c.benchmarkExTax), aud(c.leakage), pct(c.leakagePct)])}
          />
        )}
      </DashboardPanel>

      <DashboardPanel>
        <DashboardPanelHeader title="Top under-priced parts" />
        {report.topUnderpricedParts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No part was invoiced below its benchmark.</p>
        ) : (
          <Table
            caption="Top under-priced parts"
            head={["Part", "Description", "Lines", "Your average", "Benchmark", "Total gap"]}
            rows={report.topUnderpricedParts.map((p) => [p.partNumber, p.description, String(p.lineCount), aud(p.actualAvgUnitPrice), aud(p.benchmarkUnitPrice), aud(p.totalGap)])}
          />
        )}
      </DashboardPanel>

      <DashboardPanel>
        <DashboardPanelHeader
          title="By equipment and labour category"
          description={`Under-charged against category rates: ${aud(categoryLeakage.totalUnderCharge)} across ${categoryLeakage.linesAnalyzed.toLocaleString("en-AU")} lines.`}
        />
        <Table
          caption="Leakage by category"
          head={["Category", "Lines", "Charged", "Average unit", "Target rate", "Under-charge"]}
          rows={categoryLeakage.byCategory.map((c) => [CATEGORY_LABELS[c.category] ?? c.category, String(c.lines), aud(c.chargedTotal), aud(c.avgUnitPrice), c.targetRate === null ? "Not benchmarked" : aud(c.targetRate), aud(c.underCharge)])}
        />
      </DashboardPanel>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((cell, j) => (
                <td key={j} className="py-2 pr-4">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
