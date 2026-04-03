"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Filter,
  ExternalLink,
  Users,
  FileCheck,
  BarChart2,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  InspectionEvidenceRow,
  EvidenceReviewSummary,
} from "@/app/api/admin/evidence-review/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function completionColor(pct: number) {
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 50) return "text-amber-400";
  return "text-red-400";
}

function completionBarColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
    SUBMITTED: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    PROCESSING: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    CLASSIFIED: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    SCOPED: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    ESTIMATED: "bg-green-500/20 text-green-300 border-green-500/30",
    COMPLETED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  };
  return map[status] ?? "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "danger" | "success";
}) {
  const variants = {
    default: "border-white/10 bg-white/5",
    warning: "border-amber-500/20 bg-amber-500/5",
    danger: "border-red-500/20 bg-red-500/5",
    success: "border-emerald-500/20 bg-emerald-500/5",
  };
  const iconVariants = {
    default: "text-cyan-400",
    warning: "text-amber-400",
    danger: "text-red-400",
    success: "text-emerald-400",
  };
  return (
    <Card className={variants[variant]}>
      <CardContent className="flex items-start gap-3 pt-5">
        <div className="rounded-lg bg-white/5 p-2">
          <Icon className={cn("h-5 w-5", iconVariants[variant])} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-zinc-400">{label}</p>
          {sub && <p className="mt-0.5 text-xs text-zinc-600">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Inspection Row ───────────────────────────────────────────────────────────

function InspectionRow({
  row,
  onNavigate,
}: {
  row: InspectionEvidenceRow;
  onNavigate: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Expand toggle */}
        <td className="px-3 py-3 text-zinc-500">
          {row.gapCount > 0 ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500/40" />
          )}
        </td>

        {/* Inspection */}
        <td className="px-3 py-3">
          <p className="text-sm font-medium text-white">
            #{row.inspectionNumber}
          </p>
          <p className="max-w-[200px] truncate text-xs text-zinc-500">
            {row.propertyAddress}
          </p>
        </td>

        {/* Technician */}
        <td className="px-3 py-3">
          <p className="text-sm text-zinc-300">{row.technicianName ?? "—"}</p>
          <p className="text-xs text-zinc-600">{row.technicianEmail ?? ""}</p>
        </td>

        {/* Claim type */}
        <td className="px-3 py-3">
          <span className="text-xs text-zinc-400">
            {row.claimType.replace(/_/g, " ")}
          </span>
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          <Badge
            variant="outline"
            className={cn("text-xs", statusBadge(row.status))}
          >
            {row.status}
          </Badge>
        </td>

        {/* Completion */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="w-24">
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    completionBarColor(row.completionPercentage),
                  )}
                  style={{ width: `${row.completionPercentage}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                completionColor(row.completionPercentage),
              )}
            >
              {row.completionPercentage}%
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-600">
            {row.totalCaptured} / {row.totalRequired} items
          </p>
        </td>

        {/* Gaps / Flags */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            {row.gapCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                {row.gapCount} gap{row.gapCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {row.flaggedCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                <Flag className="mr-1 h-3 w-3" />
                {row.flaggedCount}
              </Badge>
            )}
          </div>
        </td>

        {/* Action */}
        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate(row.id)}
            className="h-7 px-2 text-zinc-500 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>

      {/* Expanded gap detail */}
      {expanded && row.gapCount > 0 && (
        <tr className="border-b border-white/5 bg-white/[0.015]">
          <td colSpan={8} className="px-6 py-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Missing Evidence
              </p>
              <div className="flex flex-wrap gap-2">
                {row.gaps.map((gap) => (
                  <div
                    key={gap.evidenceClass}
                    className="flex items-center gap-1.5 rounded border border-red-500/20 bg-red-500/5 px-2 py-1"
                  >
                    <XCircle className="h-3 w-3 text-red-400" />
                    <span className="text-xs text-zinc-300">
                      {gap.displayName}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {gap.captured}/{gap.required}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EvidenceReviewPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [rows, setRows] = useState<InspectionEvidenceRow[]>([]);
  const [summary, setSummary] = useState<EvidenceReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auth guard
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
    }
  }, [authStatus, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (gapsOnly) params.set("gapsOnly", "true");

      const res = await fetch(`/api/admin/evidence-review?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setRows(json.data ?? []);
      setSummary(json.summary ?? null);
    } catch {
      // keep existing data on refresh failure
    } finally {
      setLoading(false);
    }
  }, [statusFilter, gapsOnly, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-[#0a0a0a] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Evidence Review
            </h1>
            <p className="text-sm text-zinc-500">
              Missing evidence across active inspections — RA-402
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="border-white/10 text-zinc-300"
          >
            <RefreshCw
              className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Active Inspections"
              value={summary.totalActiveInspections}
              icon={FileCheck}
            />
            <StatCard
              label="With Evidence Gaps"
              value={summary.inspectionsWithGaps}
              sub={
                summary.totalActiveInspections > 0
                  ? `${Math.round((summary.inspectionsWithGaps / summary.totalActiveInspections) * 100)}% of active`
                  : undefined
              }
              icon={AlertTriangle}
              variant={summary.inspectionsWithGaps > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Flagged Items"
              value={summary.totalFlaggedItems}
              icon={Flag}
              variant={summary.totalFlaggedItems > 0 ? "danger" : "default"}
            />
            <StatCard
              label="Avg. Completion"
              value={`${summary.averageCompletion}%`}
              icon={BarChart2}
              variant={
                summary.averageCompletion >= 80
                  ? "success"
                  : summary.averageCompletion >= 50
                    ? "warning"
                    : "danger"
              }
            />
          </div>
        )}

        {/* Technician breakdown */}
        {summary && summary.technicianBreakdown.length > 0 && (
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-400" />
                <CardTitle className="text-base text-white">
                  Technician Summary
                </CardTitle>
                <CardDescription>
                  Sorted by average completion (lowest first)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.technicianBreakdown.map((tech) => (
                  <div
                    key={tech.technicianEmail}
                    className="flex items-center gap-4"
                  >
                    <div className="w-32 shrink-0">
                      <p className="truncate text-sm text-zinc-300">
                        {tech.technicianName}
                      </p>
                      <p className="truncate text-xs text-zinc-600">
                        {tech.inspectionCount} inspection
                        {tech.inspectionCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex flex-1 items-center gap-2">
                      <Progress
                        value={tech.avgCompletion}
                        className="h-1.5 flex-1"
                      />
                      <span
                        className={cn(
                          "w-10 text-right text-sm font-medium tabular-nums",
                          completionColor(tech.avgCompletion),
                        )}
                      >
                        {tech.avgCompletion}%
                      </span>
                    </div>
                    {tech.totalGaps > 0 && (
                      <Badge className="shrink-0 bg-red-500/20 text-red-400 border-red-500/30">
                        {tech.totalGaps} gap{tech.totalGaps !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-zinc-500" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 border-white/10 bg-white/5 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="PROCESSING,CLASSIFIED,SCOPED">
                In Progress
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={gapsOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setGapsOnly((g) => !g)}
            className={
              gapsOnly
                ? "bg-red-600 text-white hover:bg-red-700"
                : "border-white/10 text-zinc-400"
            }
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            Gaps Only
          </Button>

          <span className="text-sm text-zinc-600">
            {rows.length} inspection{rows.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <Card className="border-white/10 bg-white/5">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 animate-spin text-zinc-600" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500/40" />
                <p className="text-zinc-400">
                  {gapsOnly
                    ? "No inspections with evidence gaps"
                    : "No active inspections found"}
                </p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500 w-8" />
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                      Inspection
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                      Technician
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                      Type
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                      Evidence
                    </th>
                    <th className="px-3 py-2 text-xs font-medium text-zinc-500">
                      Issues
                    </th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <InspectionRow
                      key={row.id}
                      row={row}
                      onNavigate={(id) =>
                        router.push(`/dashboard/inspections/${id}/capture`)
                      }
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
