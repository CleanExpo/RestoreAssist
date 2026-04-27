"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/EmptyState";

interface Report {
  id: string;
  reportNumber: string | null;
  title: string;
  clientName: string;
  createdAt: string;
}

interface Section {
  name: string;
  score: number;
  status: "complete" | "partial" | "missing";
  issues: string[];
}

interface CompletenessResult {
  reportId: string;
  reportTitle: string;
  overallScore: number;
  sections: Section[];
}

function ScoreRing({ score }: { score: number }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80)
      return {
        stroke: "#22c55e",
        text: "text-green-600 dark:text-green-400",
        bg: "bg-green-50 dark:bg-green-950/20",
      };
    if (s >= 50)
      return {
        stroke: "#f59e0b",
        text: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/20",
      };
    return {
      stroke: "#ef4444",
      text: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-950/20",
    };
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("relative rounded-full p-3", color.bg)}>
        <svg width={180} height={180} className="transform -rotate-90">
          <circle
            cx={90}
            cy={90}
            r={radius}
            stroke="currentColor"
            strokeWidth={12}
            fill="none"
            className="text-slate-200 dark:text-slate-700"
          />
          <circle
            cx={90}
            cy={90}
            r={radius}
            stroke={color.stroke}
            strokeWidth={12}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-4xl font-bold", color.text)}>{score}%</span>
        </div>
      </div>
      <span className="text-base font-semibold text-slate-700 dark:text-slate-300">
        Overall Completeness
      </span>
    </div>
  );
}

function SectionCard({
  section,
  reportId,
}: {
  section: Section;
  reportId: string;
}) {
  const statusConfig = {
    complete: {
      icon: CheckCircle2,
      color: "text-green-600 dark:text-green-400",
      badge:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      label: "Complete",
    },
    partial: {
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      badge:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      label: "Partial",
    },
    missing: {
      icon: XCircle,
      color: "text-red-600 dark:text-red-400",
      badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      label: "Missing",
    },
  };

  const cfg = statusConfig[section.status];
  const StatusIcon = cfg.icon;

  const barColor =
    section.score >= 80
      ? "bg-green-500"
      : section.score >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  // Build fix links per section
  const fixLink = getFixLink(section.name, reportId);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">
            {section.name}
          </CardTitle>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
              cfg.badge,
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        {/* Score bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Score</span>
            <span className="font-medium">{section.score}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                barColor,
              )}
              style={{ width: `${section.score}%` }}
            />
          </div>
        </div>

        {/* Issues */}
        {section.issues.length > 0 ? (
          <ul className="flex flex-col gap-1.5 flex-1">
            {section.issues.map((issue, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400"
              >
                <span className="mt-0.5 shrink-0 text-red-400">•</span>
                {issue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-green-600 dark:text-green-400 flex-1">
            All checks passed
          </p>
        )}

        {/* Fix link */}
        {fixLink && section.status !== "complete" && (
          <Link
            href={fixLink}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline mt-auto pt-1"
          >
            Fix this <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function getFixLink(sectionName: string, reportId: string): string | null {
  switch (sectionName) {
    case "Client Information":
      return `/dashboard/clients`;
    case "Inspection Data":
      return `/dashboard/inspections`;
    case "IICRC Classification":
      return `/dashboard/inspections/${reportId}?tab=classification`;
    case "Scope of Works":
      return `/dashboard/reports/${reportId}?tab=scope`;
    case "Cost Estimates":
      return `/dashboard/reports/${reportId}?tab=costs`;
    case "Site Photos":
      return `/dashboard/inspections/${reportId}?tab=photos`;
    default:
      return null;
  }
}

function SectionSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
        <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function CompletenessCheckPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CompletenessResult | null>(null);

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch("/api/reports");
        if (!res.ok) throw new Error("Failed to fetch reports");
        const data = await res.json();
        setReports(data.reports ?? []);
      } catch {
        toast.error("Could not load reports list");
      } finally {
        setLoadingReports(false);
      }
    }
    loadReports();
  }, []);

  async function runCheck() {
    if (!selectedReportId) {
      toast.error("Please select a report first");
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch("/api/reports/completeness-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: selectedReportId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Check failed");
      }
      const data: CompletenessResult = await res.json();
      setResult(data);
    } catch (err: any) {
      toast.error(err.message ?? "Completeness check failed");
    } finally {
      setChecking(false);
    }
  }

  const selectedReport = reports.find((r) => r.id === selectedReportId);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Report Completeness Checker
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Select a report and run a check to see which sections are
              complete, partial, or missing.
            </p>
          </div>
        </div>

        {/* Report Selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select a Report</CardTitle>
            <CardDescription>
              Choose the report you want to analyse for completeness.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                {loadingReports ? (
                  <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                ) : (
                  <Select
                    value={selectedReportId}
                    onValueChange={(v) => {
                      setSelectedReportId(v);
                      setResult(null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Search or select a report…" />
                    </SelectTrigger>
                    <SelectContent>
                      {reports.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-slate-500 text-center">
                          No reports found
                        </div>
                      ) : (
                        reports.map((report) => (
                          <SelectItem key={report.id} value={report.id}>
                            <span className="font-medium">
                              {report.reportNumber ?? report.id.slice(0, 8)}
                            </span>
                            <span className="text-slate-400 ml-2">
                              — {report.clientName}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                onClick={runCheck}
                disabled={!selectedReportId || checking || loadingReports}
                className="shrink-0"
              >
                {checking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Run Check
                  </>
                )}
              </Button>
            </div>
            {selectedReport && !checking && !result && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Selected:{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {selectedReport.title}
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Empty state — before any check */}
        {!checking && !result && (
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title="No report selected yet"
            description="Pick a report from the dropdown above and click Run Check to see the completeness analysis."
            className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700"
          />
        )}

        {/* Loading skeleton */}
        {checking && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="h-52 w-52 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <SectionSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {!checking && result && (
          <div className="space-y-8">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={result.overallScore} />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Report:{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {result.reportTitle}
                </span>
              </p>
              {result.overallScore >= 80 && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Ready to submit
                </Badge>
              )}
              {result.overallScore >= 50 && result.overallScore < 80 && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                  <AlertTriangle className="mr-1 h-3 w-3" /> Some sections need
                  attention
                </Badge>
              )}
              {result.overallScore < 50 && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">
                  <XCircle className="mr-1 h-3 w-3" /> Significant gaps found
                </Badge>
              )}
            </div>

            {/* Section cards */}
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-4">
                Section Breakdown
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.sections.map((section) => (
                  <SectionCard
                    key={section.name}
                    section={section}
                    reportId={result.reportId}
                  />
                ))}
              </div>
            </div>

            {/* Run again */}
            <div className="flex justify-center">
              <Button variant="outline" onClick={runCheck} disabled={checking}>
                {checking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BarChart3 className="mr-2 h-4 w-4" />
                )}
                Run Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
