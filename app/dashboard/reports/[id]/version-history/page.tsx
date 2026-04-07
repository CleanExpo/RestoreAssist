"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  History,
  User,
  Clock,
  TrendingUp,
  TrendingDown,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// --- Types ---

interface VersionChange {
  field: string;
  from: string | number | null;
  to: string | number | null;
}

interface VersionEntry {
  version: number;
  date: string;
  action: string;
  changedBy: string;
  changes?: VersionChange[];
}

interface VersionHistoryResponse {
  versionHistory: VersionEntry[];
}

// Fields we care about rendering diffs for
const DIFFABLE_FIELDS: Record<string, string> = {
  totalCost: "Total Cost",
  waterCategory: "Water Category",
  waterClass: "Water Class",
  status: "Status",
  scopeOfWorksDocument: "Scope Document",
};

function formatTimestamp(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

function formatFieldValue(
  field: string,
  value: string | number | null,
): string {
  if (value === null || value === undefined) return "—";
  if (field === "totalCost")
    return `$${Number(value).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
  return String(value);
}

// --- Sub-components ---

function ChangeDiff({ changes }: { changes: VersionChange[] }) {
  const relevant = changes.filter((c) => DIFFABLE_FIELDS[c.field]);

  if (relevant.length === 0) {
    return <p className="text-sm text-slate-500 italic">Minor update</p>;
  }

  return (
    <div className="space-y-2 mt-3">
      {relevant.map((change) => {
        const label = DIFFABLE_FIELDS[change.field];
        const isScope = change.field === "scopeOfWorksDocument";
        const isCost = change.field === "totalCost";

        if (isScope) {
          return (
            <div key={change.field} className="flex items-center gap-2 text-sm">
              <FileText size={14} className="text-slate-400 shrink-0" />
              <span className="text-slate-400">{label}:</span>
              <span className="text-cyan-400">Scope document updated</span>
            </div>
          );
        }

        const fromVal = formatFieldValue(change.field, change.from);
        const toVal = formatFieldValue(change.field, change.to);

        // Determine cost direction for icon
        const costWentUp =
          isCost &&
          change.from !== null &&
          change.to !== null &&
          Number(change.to) > Number(change.from);
        const costWentDown =
          isCost &&
          change.from !== null &&
          change.to !== null &&
          Number(change.to) < Number(change.from);

        return (
          <div
            key={change.field}
            className="flex items-center gap-2 text-sm flex-wrap"
          >
            <span className="text-slate-400 shrink-0">{label}:</span>
            <span className="text-red-400 line-through">{fromVal}</span>
            <span className="text-slate-500">→</span>
            <span className="text-green-400">{toVal}</span>
            {costWentUp && <TrendingUp size={14} className="text-green-400" />}
            {costWentDown && (
              <TrendingDown size={14} className="text-red-400" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineEntryCard({
  entry,
  isCurrent,
}: {
  entry: VersionEntry;
  isCurrent: boolean;
}) {
  const hasChanges = entry.changes && entry.changes.length > 0;
  const hasOnlyNonDiffable =
    hasChanges && entry.changes!.every((c) => !DIFFABLE_FIELDS[c.field]);

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 z-10 ${
            isCurrent
              ? "bg-cyan-500 border-cyan-400 text-white"
              : "bg-slate-800 border-slate-600 text-slate-300"
          }`}
        >
          v{entry.version}
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 pb-6">
        <Card className="bg-slate-800/60 border-slate-700">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-100 text-sm">
                  {entry.action}
                </span>
                {isCurrent && (
                  <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                    Current Version
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-500 font-mono">
                v{entry.version}
              </span>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-4 space-y-2">
            <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
              <span className="flex items-center gap-1">
                <User size={12} />
                {entry.changedBy}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimestamp(entry.date)}
              </span>
            </div>

            <Separator className="bg-slate-700/50" />

            {hasChanges && !hasOnlyNonDiffable ? (
              <ChangeDiff changes={entry.changes!} />
            ) : (
              <p className="text-sm text-slate-500 italic">
                {entry.version === 1
                  ? "Initial report created"
                  : "Minor update"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4 pb-6">
          <div className="flex flex-col items-center shrink-0">
            <Skeleton className="w-8 h-8 rounded-full bg-slate-700" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-28 w-full rounded-lg bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <History size={48} className="text-slate-600 mb-4" />
      <h3 className="text-lg font-semibold text-slate-300 mb-2">
        No Version History
      </h3>
      <p className="text-slate-500 text-sm max-w-xs">
        No version history has been recorded for this report yet.
      </p>
    </div>
  );
}

// --- Main Page ---

export default function ReportVersionHistoryPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;

  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [reportTitle, setReportTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Fetch version history
        const histRes = await fetch(`/api/reports/${id}/version-history`);
        if (!histRes.ok) {
          const body = await histRes.json().catch(() => ({}));
          throw new Error(body.error || "Failed to fetch version history");
        }
        const histData: VersionHistoryResponse = await histRes.json();
        // Sort descending so newest is first
        const sorted = [...(histData.versionHistory ?? [])].sort(
          (a, b) => b.version - a.version,
        );
        setVersions(sorted);

        // Optionally fetch the report title (non-blocking)
        const reportRes = await fetch(`/api/reports/${id}`);
        if (reportRes.ok) {
          const reportData = await reportRes.json();
          setReportTitle(
            reportData.reportNumber ||
              reportData.title ||
              reportData.clientName ||
              null,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  const currentVersion = versions.length > 0 ? versions[0].version : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
      {/* Back link */}
      <Link
        href={`/dashboard/reports/${id}`}
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Report
      </Link>

      {/* Title block */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <History size={22} className="text-cyan-400" />
          <h1 className="text-2xl font-semibold text-slate-100">
            Version History
          </h1>
        </div>
        {reportTitle && (
          <p className="text-slate-400 text-sm ml-9">{reportTitle}</p>
        )}
      </div>

      <Separator className="bg-slate-700" />

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="rounded-lg bg-red-900/20 border border-red-700/40 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : versions.length === 0 ? (
        <EmptyState />
      ) : (
        /* Timeline */
        <div className="relative">
          {/* Vertical line */}
          <div
            className="absolute left-4 top-4 bottom-0 w-px bg-slate-700"
            aria-hidden="true"
          />

          <div className="space-y-0">
            {versions.map((entry) => (
              <TimelineEntryCard
                key={`${entry.version}-${entry.date}`}
                entry={entry}
                isCurrent={entry.version === currentVersion}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
