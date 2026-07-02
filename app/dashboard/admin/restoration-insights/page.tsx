"use client";

/**
 * RA-6917 Phase 3 (UI) — admin view of the de-identified restoration data asset.
 * Renders the N-anonymity-suppressed annual report and offers a CSV download.
 * Read-only; all aggregation + suppression happens server-side.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Lock, Download, BarChart3, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface InsightCell {
  key: Record<string, string | null>;
  count: number;
  avgRemediationDays: number | null;
  avgFloorAreaM2: number | null;
}
interface ReportSection {
  breakdown: string;
  dimensions: string[];
  cells: InsightCell[];
  suppressedCells: number;
}
interface AnnualReport {
  year: number;
  state: string | null;
  minCellCount: number;
  totalIncidents: number;
  suppressed: boolean;
  sections: ReportSection[];
  notes: string[];
}

const BREAKDOWN_LABELS: Record<string, string> = {
  by_state: "By state",
  by_water_category: "By water category",
  by_damage_class: "By damage class",
  by_loss_source: "By loss source",
  by_state_water_category: "By state and water category",
};

export default function RestorationInsightsPage() {
  const { data: session, status } = useSession();
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(currentYear);
  const [report, setReport] = useState<AnnualReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/restoration-insights/annual-report?year=${targetYear}`,
      );
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const json = (await res.json()) as { data: AnnualReport };
      setReport(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "loading" && session?.user?.role === "ADMIN") {
      void load(year);
    }
  }, [status, session, year, load]);

  // Admin guard — after hooks (rules-of-hooks).
  if (status !== "loading" && session?.user?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
            <div className="p-4 rounded-full bg-red-500/10">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">Access Denied</h2>
              <p className="text-sm text-neutral-500 mt-1">
                This page is restricted to administrators.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const csvHref = `/api/admin/restoration-insights/annual-report?year=${year}&format=csv`;
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
            Restoration Insights
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            De-identified industry data asset. Aggregates only — cells below the
            privacy threshold are suppressed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="report-year" className="sr-only">
            Report year
          </label>
          <select
            id="report-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-9 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent px-3 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Button asChild variant="outline">
            <a href={csvHref} download>
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
              Download CSV
            </a>
          </Button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-neutral-500">
            Loading {year} report…
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {report && !loading && report.suppressed && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto text-neutral-400" aria-hidden="true" />
            <p className="text-sm text-neutral-500">
              {report.notes[0] ??
                `Insufficient data for ${report.year} to publish (privacy threshold not met).`}
            </p>
          </CardContent>
        </Card>
      )}

      {report && !loading && !report.suppressed && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{report.year} summary</span>
                <Badge variant="secondary">
                  {report.totalIncidents.toLocaleString()} incidents
                </Badge>
              </CardTitle>
              <CardDescription>
                {report.notes.join(" ")}
              </CardDescription>
            </CardHeader>
          </Card>

          {report.sections.map((section) => (
            <Card key={section.breakdown}>
              <CardHeader>
                <CardTitle className="text-base">
                  {BREAKDOWN_LABELS[section.breakdown] ?? section.breakdown}
                </CardTitle>
                {section.suppressedCells > 0 && (
                  <CardDescription>
                    {section.suppressedCells} group
                    {section.suppressedCells === 1 ? "" : "s"} suppressed for
                    privacy.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {section.cells.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No publishable groups (all below the privacy threshold).
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                          {section.dimensions.map((d) => (
                            <th key={d} className="py-2 pr-4 font-medium capitalize">
                              {d.replace(/([A-Z])/g, " $1")}
                            </th>
                          ))}
                          <th className="py-2 pr-4 font-medium tabular-nums">
                            Incidents
                          </th>
                          <th className="py-2 pr-4 font-medium tabular-nums">
                            Avg remediation days
                          </th>
                          <th className="py-2 font-medium tabular-nums">
                            Avg floor area (m²)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.cells.map((cell, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-neutral-100 dark:border-neutral-900 last:border-0"
                          >
                            {section.dimensions.map((d) => (
                              <td key={d} className="py-2 pr-4">
                                {cell.key[d] ?? "—"}
                              </td>
                            ))}
                            <td className="py-2 pr-4 tabular-nums">
                              {cell.count.toLocaleString()}
                            </td>
                            <td className="py-2 pr-4 tabular-nums">
                              {cell.avgRemediationDays === null
                                ? "—"
                                : (Math.round(cell.avgRemediationDays * 10) / 10).toFixed(1)}
                            </td>
                            <td className="py-2 tabular-nums">
                              {cell.avgFloorAreaM2 === null
                                ? "—"
                                : Math.round(cell.avgFloorAreaM2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
