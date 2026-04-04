"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileWarning,
  ClipboardCheck,
  Filter,
  BarChart3,
  Eye,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { JOB_TYPE_LABELS } from "@/lib/evidence/workflow-definitions";
import type { JobType } from "@/lib/evidence/workflow-definitions";
import { RISK_TIER_LABELS } from "@/lib/types/evidence";

// ═══ Types ═══════════════════════════════════════════════════════════

interface StepGap {
  stepKey: string;
  stepTitle: string;
  riskTier: number;
  isMandatory: boolean;
  status: string;
  evidenceCount: number;
  minimumRequired: number;
}

interface WorkflowSummary {
  jobType: string;
  experienceLevel: string;
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  isReadyToSubmit: boolean;
  submissionScore: number | null;
  lastValidatedAt: string | null;
}

interface InspectionReview {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  technicianName: string | null;
  status: string;
  inspectionDate: string;
  submittedAt: string | null;
  updatedAt: string;
  totalEvidence: number;
  isIncomplete: boolean;
  isStale: boolean;
  workflow: WorkflowSummary | null;
  stepGaps: StepGap[];
}

interface ApiResponse {
  inspections: InspectionReview[];
  summary: {
    totalWithWorkflow: number;
    totalIncomplete: number;
    totalStale: number;
    averageScore: number | null;
  };
}

type StatusFilter = "all" | "incomplete" | "stale";

// ═══ Helpers ═════════════════════════════════════════════════════════

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
  });
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-neutral-400";
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-neutral-100 dark:bg-neutral-800";
  if (score >= 80) return "bg-green-500/10";
  if (score >= 50) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function riskBadge(tier: number): { label: string; className: string } {
  if (tier === 3)
    return {
      label: "Critical",
      className: "bg-red-500/10 text-red-600 dark:text-red-400",
    };
  if (tier === 2)
    return {
      label: "Elevated",
      className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  return {
    label: "Standard",
    className:
      "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  };
}

// ═══ Skeleton ════════════════════════════════════════════════════════

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="h-4 w-1/3 rounded bg-neutral-200 dark:bg-neutral-700 mb-3" />
      <div className="h-3 w-2/3 rounded bg-neutral-200 dark:bg-neutral-700 mb-2" />
      <div className="h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}

// ═══ Main Page ═══════════════════════════════════════════════════════

export default function AdminEvidenceReviewPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");

  // Expanded rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (jobTypeFilter) params.set("jobType", jobTypeFilter);
      if (technicianFilter) params.set("technician", technicianFilter);

      const res = await fetch(
        `/api/admin/evidence-review?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, jobTypeFilter, technicianFilter]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (authStatus === "authenticated") {
      fetchData();
    }
  }, [authStatus, router, fetchData]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Auth guard
  if (authStatus === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Shield className="h-10 w-10 text-red-400" />
        <p className="text-neutral-600 dark:text-neutral-400">
          Admin access required
        </p>
      </div>
    );
  }

  const summary = data?.summary;
  const inspections = data?.inspections ?? [];

  // Derive unique technicians and job types from current data for filter dropdowns
  const uniqueTechnicians = Array.from(
    new Set(
      inspections.map((i) => i.technicianName).filter(Boolean) as string[],
    ),
  ).sort();
  const uniqueJobTypes = Array.from(
    new Set(
      inspections.map((i) => i.workflow?.jobType).filter(Boolean) as string[],
    ),
  ).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            Evidence Review
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Review claim evidence completeness across all inspections
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Total Inspections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {summary?.totalWithWorkflow ?? "—"}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              With active workflows
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Average Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-2xl font-bold",
                scoreColor(summary?.averageScore ?? null),
              )}
            >
              {summary?.averageScore !== null &&
              summary?.averageScore !== undefined
                ? `${summary.averageScore}%`
                : "—"}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Evidence completeness
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Incomplete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary?.totalIncomplete ?? "—"}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Missing mandatory evidence
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">
              Stale (&gt;48h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {summary?.totalStale ?? "—"}
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              No updates in 48+ hours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Search by inspection #, address, or technician..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchData()}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["all", "incomplete", "stale"] as StatusFilter[]).map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(s);
                  }}
                  className="capitalize"
                >
                  {s === "stale" ? "Stale (>48h)" : s}
                </Button>
              ))}
            </div>
            {uniqueJobTypes.length > 0 && (
              <select
                value={jobTypeFilter}
                onChange={(e) => {
                  setJobTypeFilter(e.target.value);
                }}
                className="h-9 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 text-sm"
              >
                <option value="">All job types</option>
                {uniqueJobTypes.map((jt) => (
                  <option key={jt} value={jt}>
                    {JOB_TYPE_LABELS[jt as JobType] ?? jt}
                  </option>
                ))}
              </select>
            )}
            {uniqueTechnicians.length > 0 && (
              <select
                value={technicianFilter}
                onChange={(e) => {
                  setTechnicianFilter(e.target.value);
                }}
                className="h-9 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 text-sm"
              >
                <option value="">All technicians</option>
                {uniqueTechnicians.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              className="gap-1"
            >
              <Filter className="h-3.5 w-3.5" />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                Failed to load evidence data
              </p>
              <p className="text-sm text-neutral-500">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              className="ml-auto"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && inspections.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <ClipboardCheck className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
            <p className="text-neutral-500 dark:text-neutral-400">
              No inspections match the current filters
            </p>
            <p className="text-sm text-neutral-400">
              Try adjusting filters or check back when technicians have started
              workflows
            </p>
          </CardContent>
        </Card>
      )}

      {/* Inspection list */}
      {!loading && inspections.length > 0 && (
        <div className="space-y-3">
          {inspections.map((insp) => {
            const expanded = expandedIds.has(insp.id);
            const wf = insp.workflow;
            const score = wf?.submissionScore ?? null;
            const jobLabel = wf
              ? (JOB_TYPE_LABELS[wf.jobType as JobType] ?? wf.jobType)
              : "—";

            return (
              <Card
                key={insp.id}
                className={cn(
                  "transition-colors",
                  insp.isStale && "border-red-300 dark:border-red-800",
                  insp.isIncomplete &&
                    !insp.isStale &&
                    "border-amber-300 dark:border-amber-800",
                )}
              >
                {/* Row header — always visible */}
                <button
                  onClick={() => toggleExpand(insp.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-t-lg"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                  )}

                  {/* Score circle */}
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      scoreBg(score),
                      scoreColor(score),
                    )}
                  >
                    {score !== null ? `${score}` : "—"}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">
                        {insp.inspectionNumber}
                      </span>
                      <Badge variant="outline" className="text-xs font-normal">
                        {jobLabel}
                      </Badge>
                      {insp.isStale && (
                        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
                          Stale
                        </Badge>
                      )}
                      {insp.isIncomplete && !insp.isStale && (
                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                          Incomplete
                        </Badge>
                      )}
                      {wf?.isReadyToSubmit && (
                        <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
                          Ready
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {insp.propertyAddress}
                    </p>
                  </div>

                  {/* Right-side metadata */}
                  <div className="hidden sm:flex items-center gap-4 text-xs text-neutral-500 shrink-0">
                    <div className="text-right">
                      <p>{insp.technicianName ?? "Unassigned"}</p>
                      <p className="text-neutral-400">
                        {formatShortDate(insp.inspectionDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p>{insp.totalEvidence} items</p>
                      <p className="text-neutral-400">
                        {wf
                          ? `${wf.completedSteps}/${wf.totalSteps} steps`
                          : "—"}
                      </p>
                    </div>
                    {insp.stepGaps.length > 0 && (
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <FileWarning className="h-3.5 w-3.5" />
                        <span>{insp.stepGaps.length} gaps</span>
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded detail panel */}
                {expanded && (
                  <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-4 space-y-4">
                    {/* Workflow progress bar */}
                    {wf && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-500">
                            Workflow progress —{" "}
                            {wf.experienceLevel.toLowerCase()} mode
                          </span>
                          <span className={scoreColor(score)}>
                            {score !== null ? `${score}%` : "Not validated"}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              score !== null && score >= 80
                                ? "bg-green-500"
                                : score !== null && score >= 50
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            style={{ width: `${score ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Step gaps table */}
                    {insp.stepGaps.length > 0 ? (
                      <div>
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          Evidence Gaps ({insp.stepGaps.length})
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500">
                                <th className="text-left py-2 pr-3 font-medium">
                                  Step
                                </th>
                                <th className="text-left py-2 pr-3 font-medium">
                                  Risk
                                </th>
                                <th className="text-left py-2 pr-3 font-medium">
                                  Status
                                </th>
                                <th className="text-right py-2 font-medium">
                                  Evidence
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {insp.stepGaps.map((gap) => {
                                const risk = riskBadge(gap.riskTier);
                                return (
                                  <tr
                                    key={gap.stepKey}
                                    className="border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                                  >
                                    <td className="py-2 pr-3">
                                      <div className="flex items-center gap-1.5">
                                        {gap.isMandatory && (
                                          <span
                                            className="text-red-500 text-xs font-bold"
                                            title="Mandatory"
                                          >
                                            *
                                          </span>
                                        )}
                                        <span className="truncate max-w-[200px]">
                                          {gap.stepTitle}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-2 pr-3">
                                      <Badge
                                        className={cn(
                                          "text-xs",
                                          risk.className,
                                        )}
                                      >
                                        {risk.label}
                                      </Badge>
                                    </td>
                                    <td className="py-2 pr-3">
                                      <span className="text-xs text-neutral-500">
                                        {gap.status.replace(/_/g, " ")}
                                      </span>
                                    </td>
                                    <td className="py-2 text-right">
                                      <span
                                        className={cn(
                                          "text-xs font-mono",
                                          gap.evidenceCount <
                                            gap.minimumRequired
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-green-600 dark:text-green-400",
                                        )}
                                      >
                                        {gap.evidenceCount}/
                                        {gap.minimumRequired}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        All evidence requirements met
                      </div>
                    )}

                    {/* Metadata footer */}
                    <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                      <div className="flex gap-4">
                        <span>Updated: {formatDate(insp.updatedAt)}</span>
                        {insp.submittedAt && (
                          <span>Submitted: {formatDate(insp.submittedAt)}</span>
                        )}
                        {wf?.lastValidatedAt && (
                          <span>
                            Last validated: {formatDate(wf.lastValidatedAt)}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() =>
                          router.push(
                            `/dashboard/inspections/${insp.id}/capture`,
                          )
                        }
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Workflow
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
