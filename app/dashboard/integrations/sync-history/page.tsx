"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderHealth {
  provider: string;
  status: string;
  lastSyncAt: string | null;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  successRate: number;
}

interface MetricsData {
  integrations: {
    total: number;
    connected: number;
    byProvider: Record<string, ProviderHealth>;
  };
  syncs: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
  };
}

interface SyncLogEntry {
  id: string;
  syncType: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  integration: {
    id: string;
    provider: string;
    name: string;
    status: string;
  };
}

interface SyncErrorsData {
  syncErrors: SyncLogEntry[];
  pagination: {
    total: number;
    hasMore: boolean;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  XERO: "Xero",
  QUICKBOOKS: "QuickBooks",
  MYOB: "MYOB",
  SERVICEM8: "ServiceM8",
  ASCORA: "Ascora",
};

const ALL_PROVIDERS = ["XERO", "QUICKBOOKS", "MYOB", "SERVICEM8", "ASCORA"];

type FilterTab = "all" | "success" | "failed" | "partial";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "SUCCESS":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Success
        </Badge>
      );
    case "FAILED":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case "PARTIAL":
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
          <AlertCircle className="w-3 h-3 mr-1" />
          Partial
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 mr-1" />
          {status}
        </Badge>
      );
  }
}

function IntegrationStatusDot({ status }: { status: string }) {
  if (status === "CONNECTED")
    return <span className="inline-block w-2 h-2 rounded-full bg-green-500" />;
  if (status === "ERROR")
    return <span className="inline-block w-2 h-2 rounded-full bg-red-500" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />;
}

function HealthCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
      </CardContent>
    </Card>
  );
}

function TableRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-12" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-12" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-10" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-28" />
      </TableCell>
    </TableRow>
  );
}

function ExpandableError({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.length > 80;

  if (!isLong) {
    return <span className="text-red-600 text-xs">{message}</span>;
  }

  return (
    <span>
      <span className="text-red-600 text-xs">
        {expanded ? message : `${message.slice(0, 80)}…`}
      </span>
      <button
        onClick={() => setExpanded(!expanded)}
        className="ml-1 text-xs text-blue-600 hover:underline"
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

// ─── Health Summary Row ───────────────────────────────────────────────────────

function HealthSummaryRow({
  metrics,
  loading,
}: {
  metrics: MetricsData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <HealthCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {ALL_PROVIDERS.map((slug) => {
        const data = metrics?.integrations.byProvider[slug];
        const label = PROVIDER_LABELS[slug] ?? slug;

        if (!data) {
          // Provider not connected
          return (
            <Card key={slug} className="opacity-60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Not connected</p>
              </CardContent>
            </Card>
          );
        }

        const lastSyncStatus =
          data.successfulSyncs > 0
            ? data.failedSyncs > 0
              ? "PARTIAL"
              : "SUCCESS"
            : data.failedSyncs > 0
              ? "FAILED"
              : null;

        return (
          <Card key={slug}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <IntegrationStatusDot status={data.status} />
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Last sync:{" "}
                <span className="font-medium text-foreground">
                  {formatRelativeTime(data.lastSyncAt)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {data.totalSyncs} sync{data.totalSyncs !== 1 ? "s" : ""}{" "}
                &middot;{" "}
                <span className="text-green-700">
                  {data.successfulSyncs} ok
                </span>
                {data.failedSyncs > 0 && (
                  <>
                    {" "}
                    &middot;{" "}
                    <span className="text-red-600">
                      {data.failedSyncs} failed
                    </span>
                  </>
                )}
              </p>
              {lastSyncStatus && (
                <div className="pt-1">
                  <StatusBadge status={lastSyncStatus} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Sync Event Feed ──────────────────────────────────────────────────────────

function SyncEventFeed({
  entries,
  loading,
  filter,
}: {
  entries: SyncLogEntry[];
  loading: boolean;
  filter: FilterTab;
}) {
  const filtered = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "success") return e.status === "SUCCESS";
    if (filter === "failed") return e.status === "FAILED";
    if (filter === "partial") return e.status === "PARTIAL";
    return true;
  });

  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Sync Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Processed</TableHead>
            <TableHead>Failed</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </TableBody>
      </Table>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground font-medium">
          No sync events recorded yet
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Sync events will appear here once an integration runs its first sync.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead>Sync Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Processed</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">
                {PROVIDER_LABELS[entry.integration.provider] ??
                  entry.integration.provider}
              </TableCell>
              <TableCell>
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                  {entry.syncType}
                </span>
              </TableCell>
              <TableCell>
                <StatusBadge status={entry.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {entry.recordsProcessed}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {entry.recordsFailed > 0 ? (
                  <span className="text-red-600">{entry.recordsFailed}</span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDuration(entry.startedAt, entry.completedAt)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDateTime(entry.startedAt)}
              </TableCell>
            </TableRow>
          ))}
          {/* Expand error messages below rows that have them */}
          {filtered
            .filter((e) => e.errorMessage)
            .map((entry) => (
              <TableRow key={`${entry.id}-error`} className="bg-red-50/50">
                <TableCell colSpan={7} className="py-1 pl-6">
                  <ExpandableError message={entry.errorMessage!} />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SyncHistoryPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [syncEntries, setSyncEntries] = useState<SyncLogEntry[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    // Fetch metrics (health summary)
    try {
      const res = await fetch("/api/integrations/metrics?window=168"); // 7-day window
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error("[SyncHistory] Failed to fetch metrics:", err);
    } finally {
      setMetricsLoading(false);
    }

    // Fetch sync log entries — call sync-errors with large limit to get the event feed
    // The sync-errors route returns FAILED entries individually; for SUCCESS/PARTIAL
    // we surface aggregate counts via the health cards above.
    try {
      const res = await fetch("/api/integrations/sync-errors?limit=100");
      if (res.ok) {
        const data: SyncErrorsData = await res.json();
        setSyncEntries(data.syncErrors ?? []);
      }
    } catch (err) {
      console.error("[SyncHistory] Failed to fetch sync entries:", err);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setMetricsLoading(true);
    setFeedLoading(true);
    await fetchData();
    setRefreshing(false);
  };

  // Overall health derived from metrics
  const overallStatus = !metrics
    ? null
    : metrics.syncs.successRate >= 95
      ? "healthy"
      : metrics.syncs.successRate >= 80
        ? "degraded"
        : "unhealthy";

  const overallBadge =
    overallStatus === "healthy" ? (
      <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Healthy
      </Badge>
    ) : overallStatus === "degraded" ? (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
        <AlertCircle className="w-3 h-3 mr-1" />
        Degraded
      </Badge>
    ) : overallStatus === "unhealthy" ? (
      <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
        <XCircle className="w-3 h-3 mr-1" />
        Unhealthy
      </Badge>
    ) : null;

  const tabCounts = {
    all: syncEntries.length,
    success: syncEntries.filter((e) => e.status === "SUCCESS").length,
    failed: syncEntries.filter((e) => e.status === "FAILED").length,
    partial: syncEntries.filter((e) => e.status === "PARTIAL").length,
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/dashboard/integrations"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Integrations
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Sync Health &amp; History
            </h1>
            {overallBadge}
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor integration sync activity, performance, and errors across
            all connected platforms.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Overall stats strip */}
      {!metricsLoading && metrics && (
        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground border-b pb-4">
          <span>
            <span className="font-medium text-foreground">
              {metrics.integrations.connected}
            </span>{" "}
            of {metrics.integrations.total} connected
          </span>
          <span>
            <span className="font-medium text-foreground">
              {metrics.syncs.total}
            </span>{" "}
            syncs (7d)
          </span>
          <span>
            Success rate:{" "}
            <span
              className={`font-medium ${
                metrics.syncs.successRate >= 95
                  ? "text-green-700"
                  : metrics.syncs.successRate >= 80
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {metrics.syncs.successRate.toFixed(1)}%
            </span>
          </span>
          {metrics.syncs.avgDurationMs > 0 && (
            <span>
              Avg duration:{" "}
              <span className="font-medium text-foreground">
                {metrics.syncs.avgDurationMs < 1000
                  ? `${metrics.syncs.avgDurationMs}ms`
                  : `${(metrics.syncs.avgDurationMs / 1000).toFixed(1)}s`}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Health summary cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Provider Health
        </h2>
        <HealthSummaryRow metrics={metrics} loading={metricsLoading} />
      </section>

      {/* Sync event feed */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Sync Event Feed
        </h2>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as FilterTab)}
        >
          <TabsList>
            <TabsTrigger value="all">
              All
              {!feedLoading && (
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5">
                  {tabCounts.all}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="success">
              Success
              {!feedLoading && tabCounts.success > 0 && (
                <span className="ml-1.5 text-xs bg-green-100 text-green-800 rounded-full px-1.5">
                  {tabCounts.success}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed
              {!feedLoading && tabCounts.failed > 0 && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-800 rounded-full px-1.5">
                  {tabCounts.failed}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="partial">
              Partial
              {!feedLoading && tabCounts.partial > 0 && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-800 rounded-full px-1.5">
                  {tabCounts.partial}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {(["all", "success", "failed", "partial"] as FilterTab[]).map(
            (tab) => (
              <TabsContent key={tab} value={tab} className="mt-4">
                <SyncEventFeed
                  entries={syncEntries}
                  loading={feedLoading}
                  filter={tab}
                />
              </TabsContent>
            ),
          )}
        </Tabs>
      </section>
    </div>
  );
}
