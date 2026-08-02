"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  FileText,
  BarChart3,
  Activity,
  Zap,
  UserCog,
  Wrench,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import type { ComponentProps, ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DashboardPanel,
  DashboardPanelHeader,
} from "../components/DashboardPanel";

// RA-1209: Recharts `Tooltip` props don't type `className`, though the
// underlying div accepts it. Narrow typed escape hatch replaces the
// previous `as any` — still type-checks all other props.
type TooltipWithClassProps = ComponentProps<typeof Tooltip> & {
  className?: string;
};
const TooltipAny = Tooltip as unknown as ComponentType<TooltipWithClassProps>;

import { useSession } from "next-auth/react";
import AnalyticsFilters, {
  AnalyticsFiltersValue as AnalyticsFiltersType,
} from "./components/AnalyticsFilters";
import KPICards from "./components/KPICards";
import RevenueChart from "./components/RevenueChart";
import DamageTypesChart from "./components/DamageTypesChart";
import RevenueProjection from "./components/RevenueProjection";
import TopClientsTable from "./components/TopClientsTable";
import CompletionMetrics from "./components/CompletionMetrics";
import MonthlyVolumeChart from "./components/MonthlyVolumeChart";
import BillingOverview from "./components/BillingOverview";
import ActivityFeed from "./components/ActivityFeed";
import ExecutiveSummary from "./components/ExecutiveSummary";
import StatusPipeline from "./components/StatusPipeline";
import ActivityByDay from "./components/ActivityByDay";
import PeriodComparison from "./components/PeriodComparison";
import InsightsMovers from "./components/InsightsMovers";
import AINarrativeCard from "./components/AINarrativeCard";

const CHART_CYAN = "#06b6d4";
const CHART_AMBER = "#f59e0b";
const STATE_PALETTE = [
  "#06b6d4",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
  "#64748b",
  "#e07020",
  "#3b82f6",
  "#14b8a6",
];

interface AnalyticsData {
  kpis: {
    totalReports: { value: number; change: string };
    totalRevenue: { value: number; formatted: string; change: string };
    avgReportValue: { value: number; formatted: string; change: string };
    avgCompletion: { value: string; formatted: string; change: string };
  };
  reportTrendData: Array<{ date: string; reports: number; revenue: number }>;
  hazardDistribution: Array<{ name: string; value: number; color: string }>;
  insuranceTypeData: Array<{ type: string; count: number }>;
  statePerformance: Array<{ state: string; value: number }>;
  turnaroundTime: Array<{ hazard: string; hours: number }>;
  topClients: Array<{ name: string; reports: number; revenue: string }>;
  statusDistribution?: Array<{
    status: string;
    count: number;
    revenue: number;
  }>;
  byDayOfWeek?: Array<{
    day: string;
    dayNumber: number;
    reports: number;
    revenue: number;
  }>;
  periodComparison?: {
    current: { reports: number; revenue: number };
    previous: { reports: number; revenue: number };
    changes: { reports: string; revenue: string };
  } | null;
}

interface InsightsData {
  summary: string;
  periodComparison?: {
    currentReports: number;
    previousReports: number;
    currentRevenue: number;
    previousRevenue: number;
    revenueChangePct: number;
    reportChangePct: number;
  };
  topHazard?: { name: string; count: number };
  topGrowingClients?: Array<{
    name: string;
    currentRevenue: number;
    currentReports: number;
    revenueChangePct: number;
    reportChangePct: number;
  }>;
  slowestHazards?: Array<{ hazard: string; avgHours: number; count: number }>;
  fastestHazards?: Array<{ hazard: string; avgHours: number; count: number }>;
}

interface ProjectionData {
  historical: Array<{ date: string; revenue: number }>;
  projected: Array<{
    date: string;
    revenue: number;
    isProjected: boolean;
    confidence: number;
  }>;
  trend: "improving" | "stable" | "declining";
}

interface CompletionData {
  overall: {
    avgDays: number;
    medianDays: number;
    p95Days: number;
    totalReports: number;
    completedReports?: number;
    completionRate?: number;
  };
  byHazardType: Array<{ hazardType: string; avgDays: number; count: number }>;
  timeSeries: Array<{ date: string; avgCompletionDays: number }>;
  trend: "improving" | "stable" | "declining";
}

interface ActivityFeedData {
  activities: Array<{
    id: string;
    type: "created" | "updated" | "completed";
    description: string;
    timestamp: string;
    user: { id: string; name: string | null; email: string; role: string };
    report: { id: string; title: string; clientName: string; status: string };
  }>;
  total: number;
}

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const [filters, setFilters] = useState<AnalyticsFiltersType>({
    dateRange: "30days",
  });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [projectionData, setProjectionData] = useState<ProjectionData | null>(
    null,
  );
  const [projectionUnavailable, setProjectionUnavailable] = useState(false);
  const [completionData, setCompletionData] = useState<CompletionData | null>(
    null,
  );
  const [activityFeedData, setActivityFeedData] =
    useState<ActivityFeedData | null>(null);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<"revenue" | "reports">(
    "revenue",
  );
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null>(null);
  const isAdmin = session?.user?.role === "ADMIN";

  // Fetch selected member info when userId filter changes (for Admin and Manager)
  useEffect(() => {
    const isAdmin = session?.user?.role === "ADMIN";
    const isManager = session?.user?.role === "MANAGER";

    if (filters.userId && (isAdmin || isManager)) {
      const fetchMemberInfo = async () => {
        try {
          const res = await fetch("/api/team/members");
          if (res.ok) {
            const json = await res.json();
            let members = json.members || [];

            // Manager can only see Technicians
            if (isManager) {
              members = members.filter((m: any) => m.role === "USER");
            }

            const member = members.find((m: any) => m.id === filters.userId);
            if (member) {
              setSelectedMember(member);
            } else {
              setSelectedMember(null);
            }
          }
        } catch (err) {
          console.error("Failed to fetch member info:", err);
          setSelectedMember(null);
        }
      };
      fetchMemberInfo();
    } else {
      setSelectedMember(null);
    }
  }, [filters.userId, session?.user?.role]);

  // Calculate additional insights
  const insights = useMemo(() => {
    if (!data) return null;

    const totalReports = data.kpis.totalReports.value;
    const totalRevenue = data.kpis.totalRevenue.value;
    const avgValue = data.kpis.avgReportValue.value;

    // Calculate growth rate
    const revenueChange = parseFloat(
      data.kpis.totalRevenue.change.replace("%", "").replace("+", ""),
    );
    const reportsChange = parseFloat(
      data.kpis.totalReports.change.replace("%", "").replace("+", ""),
    );

    // Calculate efficiency metrics
    const avgCompletionHours = parseFloat(data.kpis.avgCompletion.value);
    const efficiencyScore =
      avgCompletionHours > 0
        ? Math.min(100, (168 / avgCompletionHours) * 100)
        : 0; // 168 hours = 1 week

    return {
      revenueGrowth: revenueChange,
      reportsGrowth: reportsChange,
      efficiencyScore: Math.round(efficiencyScore),
      avgValuePerReport: avgValue,
      totalValue: totalRevenue,
      reportCount: totalReports,
      isGrowing: revenueChange > 0 && reportsChange > 0,
      topHazard: data.hazardDistribution[0]?.name || "N/A",
      topHazardCount: data.hazardDistribution[0]?.value || 0,
    };
  }, [data]);

  // RA-1207: empty when API returns zeros (not only when `data` is null)
  const isEmpty =
    !data ||
    (data.kpis?.totalReports?.value ?? 0) === 0 ||
    ((data.reportTrendData?.length ?? 0) === 0 &&
      (data.statePerformance?.length ?? 0) === 0);

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch main analytics
        const analyticsUrl = new URL("/api/analytics", window.location.origin);
        analyticsUrl.searchParams.set("dateRange", filters.dateRange);
        if (filters.customFrom)
          analyticsUrl.searchParams.set("from", filters.customFrom);
        if (filters.customTo)
          analyticsUrl.searchParams.set("to", filters.customTo);
        if (filters.userId)
          analyticsUrl.searchParams.set("userId", filters.userId);

        // Build URLs for projections and completion metrics
        const projectionsUrl = new URL(
          "/api/analytics/revenue-projections",
          window.location.origin,
        );
        projectionsUrl.searchParams.set("days", "90");
        if (filters.userId)
          projectionsUrl.searchParams.set("userId", filters.userId);

        const completionUrl = new URL(
          "/api/analytics/completion-metrics",
          window.location.origin,
        );
        completionUrl.searchParams.set("dateRange", filters.dateRange);
        if (filters.userId)
          completionUrl.searchParams.set("userId", filters.userId);

        const activityFeedUrl = new URL(
          "/api/analytics/activity-feed",
          window.location.origin,
        );
        activityFeedUrl.searchParams.set("limit", "50");
        if (filters.userId)
          activityFeedUrl.searchParams.set("userId", filters.userId);

        const insightsUrl = new URL(
          "/api/analytics/insights",
          window.location.origin,
        );
        insightsUrl.searchParams.set("dateRange", filters.dateRange);
        if (filters.userId)
          insightsUrl.searchParams.set("userId", filters.userId);

        const [
          analyticsRes,
          projectionsRes,
          completionRes,
          activityFeedRes,
          insightsRes,
        ] = await Promise.all([
          fetch(analyticsUrl),
          fetch(projectionsUrl),
          fetch(completionUrl),
          fetch(activityFeedUrl),
          fetch(insightsUrl),
        ]);

        if (!analyticsRes.ok) throw new Error("Failed to load analytics");

        const analyticsJson = await analyticsRes.json();
        setData(analyticsJson);

        if (projectionsRes.ok) {
          const projectionsJson = await projectionsRes.json();
          setProjectionData(projectionsJson);
          setProjectionUnavailable(false);
        } else {
          setProjectionData(null);
          setProjectionUnavailable(true);
        }

        if (completionRes.ok) {
          const completionJson = await completionRes.json();
          setCompletionData(completionJson);
        } else {
          setCompletionData(null);
        }

        if (activityFeedRes.ok) {
          const activityFeedJson = await activityFeedRes.json();
          setActivityFeedData(activityFeedJson);
        } else {
          setActivityFeedData(null);
        }

        if (insightsRes.ok) {
          const insightsJson = await insightsRes.json();
          setInsightsData(insightsJson);
        } else {
          setInsightsData(null);
        }
      } catch (err) {
        console.error("Error fetching analytics:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load analytics",
        );
        toast.error("Error loading analytics");
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [filters, isAdmin]);

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    try {
      const now = new Date();
      const from =
        filters.customFrom ||
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
      const to = filters.customTo || now.toISOString().split("T")[0];

      const response = await fetch("/api/analytics/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          dateRange: { from, to },
          includeCharts: true,
        }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-export.${format === "excel" ? "xlsx" : format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Successfully exported as ${format.toUpperCase()}`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error(`Failed to export as ${format}`);
      throw err;
    }
  };

  const periodLabel =
    filters.dateRange === "7days"
      ? "Last 7 days"
      : filters.dateRange === "30days"
        ? "Last 30 days"
        : filters.dateRange === "90days"
          ? "Last 90 days"
          : "Year to date";

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-cyan-500" aria-hidden />
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reports, revenue, and completion trends across your team.
          </p>
        </div>
      </header>

      <DashboardPanel className="p-3 sm:p-4">
        <AnalyticsFilters
          onFiltersChange={setFilters}
          isLoading={loading}
          onExport={handleExport}
        />
      </DashboardPanel>

      {selectedMember &&
        (session?.user?.role === "ADMIN" ||
          session?.user?.role === "MANAGER") && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div
              className={cn(
                "rounded-lg p-2",
                selectedMember.role === "MANAGER"
                  ? "bg-info-subtle text-info-subtle-foreground"
                  : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
              )}
            >
              {selectedMember.role === "MANAGER" ? (
                <UserCog className="h-5 w-5" />
              ) : (
                <Wrench className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Viewing analytics for{" "}
                <span className="font-semibold">
                  {selectedMember.name || selectedMember.email}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedMember.role === "MANAGER" ? "Manager" : "Technician"} ·{" "}
                {selectedMember.email}
              </p>
            </div>
          </div>
        )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilters((f) => ({ ...f }))}
          >
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <DashboardPanel key={i}>
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-8 w-20" />
              </DashboardPanel>
            ))}
          </div>
          <DashboardPanel>
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-48 w-full" />
          </DashboardPanel>
          <div className="grid lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <DashboardPanel key={i}>
                <Skeleton className="h-4 w-32 mb-4" />
                <Skeleton className="h-32 w-full" />
              </DashboardPanel>
            ))}
          </div>
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-border bg-card p-8 sm:p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <BarChart3 className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">No reports yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Create your first report to see revenue trends, performance
              metrics, and analytics insights here.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button asChild>
              <Link href="/dashboard/reports/new">
                <FileText className="h-4 w-4 mr-2" />
                Create your first report
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/inspections">Go to inspections</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {insights && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardPanel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Growth rate
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-semibold tabular-nums mt-1",
                        insights.isGrowing ? "text-success" : "text-destructive",
                      )}
                    >
                      {insights.revenueGrowth > 0 ? "+" : ""}
                      {insights.revenueGrowth.toFixed(1)}%
                    </p>
                  </div>
                  {insights.isGrowing ? (
                    <TrendingUp className="h-7 w-7 text-success shrink-0" />
                  ) : (
                    <TrendingDown className="h-7 w-7 text-destructive shrink-0" />
                  )}
                </div>
              </DashboardPanel>

              <DashboardPanel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Efficiency score
                    </p>
                    <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
                      {insights.efficiencyScore}%
                    </p>
                  </div>
                  <Zap className="h-7 w-7 text-muted-foreground shrink-0" />
                </div>
              </DashboardPanel>

              <DashboardPanel>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Top hazard type
                    </p>
                    <p className="text-lg font-semibold text-foreground mt-1 truncate">
                      {insights.topHazard}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {insights.topHazardCount} reports
                    </p>
                  </div>
                  <Activity className="h-7 w-7 text-muted-foreground shrink-0" />
                </div>
              </DashboardPanel>

              <DashboardPanel>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Avg value / report
                    </p>
                    <p className="text-2xl font-semibold text-foreground tabular-nums mt-1">
                      ${(insights.avgValuePerReport / 1000).toFixed(1)}K
                    </p>
                  </div>
                  <DollarSign className="h-7 w-7 text-muted-foreground shrink-0" />
                </div>
              </DashboardPanel>
            </div>
          )}

          <AINarrativeCard
            period={
              filters.dateRange === "90days"
                ? "quarter"
                : filters.dateRange === "ytd"
                  ? "year"
                  : "month"
            }
          />

          <ExecutiveSummary
            summary={insightsData?.summary ?? ""}
            periodLabel={periodLabel}
            loading={loading}
          />

          <KPICards data={data?.kpis || null} />

          <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
            <PeriodComparison
              data={data?.periodComparison ?? null}
              currentLabel="This period"
              previousLabel="Previous period"
              loading={loading}
            />
            <StatusPipeline
              data={data?.statusDistribution ?? []}
              loading={loading}
            />
            <ActivityByDay data={data?.byDayOfWeek ?? []} loading={loading} />
          </div>

          <InsightsMovers
            topGrowingClients={insightsData?.topGrowingClients ?? []}
            slowestHazards={insightsData?.slowestHazards ?? []}
            fastestHazards={insightsData?.fastestHazards ?? []}
            loading={loading}
          />

          <DashboardPanel>
            <RevenueChart
              data={data?.reportTrendData || []}
              dateRange={filters.dateRange}
            />
          </DashboardPanel>

          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            <DashboardPanel padded={false}>
              <DamageTypesChart data={data?.hazardDistribution || []} />
            </DashboardPanel>

            {data?.insuranceTypeData && data.insuranceTypeData.length > 0 && (
              <DashboardPanel>
                <DashboardPanelHeader
                  title="Insurance distribution"
                  action={
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  }
                />
                <div className="space-y-4">
                  {data.insuranceTypeData.map((item, idx) => {
                    const maxCount = Math.max(
                      ...data.insuranceTypeData.map((i) => i.count),
                    );
                    const percentage =
                      maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                    return (
                      <div key={`${item.type}-${idx}`} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {item.type || "Unknown"}
                          </span>
                          <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums">
                            {item.count}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Insurance types
                  </span>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {data.insuranceTypeData.length}
                  </span>
                </div>
              </DashboardPanel>
            )}
          </div>

          {(data?.statePerformance?.length ||
            data?.turnaroundTime?.length) && (
            <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
              {data?.statePerformance && data.statePerformance.length > 0 && (
                <DashboardPanel className="lg:col-span-2">
                  <DashboardPanelHeader
                    title="Performance by state"
                    action={
                      <Activity className="h-5 w-5 text-muted-foreground" />
                    }
                  />
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.statePerformance.slice(0, 8)}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="state"
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <TooltipAny
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          color: "hsl(var(--foreground))",
                        }}
                        formatter={(value: number | string) => [
                          `${value} reports`,
                          "Count",
                        ]}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.statePerformance.slice(0, 8).map((_, index) => (
                          <Cell
                            key={`state-${index}`}
                            fill={STATE_PALETTE[index % STATE_PALETTE.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </DashboardPanel>
              )}

              {data?.turnaroundTime && data.turnaroundTime.length > 0 && (
                <DashboardPanel>
                  <DashboardPanelHeader
                    title="Turnaround time"
                    action={<Clock className="h-5 w-5 text-muted-foreground" />}
                  />
                  <div className="space-y-4">
                    {data.turnaroundTime.slice(0, 5).map((item, idx) => {
                      const maxHours = Math.max(
                        ...data.turnaroundTime.map((t) => t.hours),
                      );
                      const percentage =
                        maxHours > 0 ? (item.hours / maxHours) * 100 : 0;
                      return (
                        <div key={`${item.hazard}-${idx}`} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {item.hazard}
                            </span>
                            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                              {item.hours.toFixed(1)}h
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500 transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {data.turnaroundTime.length > 5 && (
                    <p className="mt-4 pt-4 border-t border-border text-center text-xs text-muted-foreground">
                      +{data.turnaroundTime.length - 5} more hazard types
                    </p>
                  )}
                </DashboardPanel>
              )}
            </div>
          )}

          <DashboardPanel padded={false}>
            {projectionData ? (
              <RevenueProjection
                historical={projectionData.historical}
                projected={projectionData.projected}
                trend={projectionData.trend}
              />
            ) : projectionUnavailable ? (
              <div className="p-10 sm:p-12 text-center space-y-2">
                <p className="font-medium text-foreground">
                  Revenue forecast unavailable
                </p>
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t load the projection for this period. Try
                  refreshing or changing the date range.
                </p>
              </div>
            ) : (
              <div className="p-10 sm:p-12 text-center space-y-3">
                <Loader2 className="h-7 w-7 text-cyan-500 animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Calculating revenue forecast…
                </p>
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel padded={false}>
            <TopClientsTable
              data={
                data?.topClients?.map((client) => ({
                  name: client.name,
                  reports: client.reports,
                  revenue: client.revenue,
                })) || []
              }
            />
          </DashboardPanel>

          <DashboardPanel padded={false}>
            <MonthlyVolumeChart userId={filters.userId} months={12} />
          </DashboardPanel>

          {completionData && (
            <DashboardPanel padded={false}>
              <CompletionMetrics
                overall={completionData.overall}
                byHazardType={completionData.byHazardType}
                timeSeries={completionData.timeSeries}
                trend={completionData.trend}
              />
            </DashboardPanel>
          )}

          {isAdmin && (
            <DashboardPanel padded={false}>
              <BillingOverview />
            </DashboardPanel>
          )}

          {activityFeedData && (
            <DashboardPanel padded={false}>
              <ActivityFeed activities={activityFeedData.activities} />
            </DashboardPanel>
          )}

          {data?.reportTrendData && data.reportTrendData.length > 0 && (
            <DashboardPanel>
              <DashboardPanelHeader
                title="Revenue vs reports trend"
                action={
                  <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => setSelectedMetric("revenue")}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        selectedMetric === "revenue"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Revenue
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMetric("reports")}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                        selectedMetric === "reports"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Reports
                    </button>
                  </div>
                }
              />
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.reportTrendData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_CYAN} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={CHART_CYAN} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_AMBER} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={CHART_AMBER} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                    angle={data.reportTrendData.length > 10 ? -45 : 0}
                    textAnchor={
                      data.reportTrendData.length > 10 ? "end" : "middle"
                    }
                    height={data.reportTrendData.length > 10 ? 80 : 30}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <TooltipAny
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value, name) => {
                      if (String(name) === "revenue")
                        return [
                          `$${Number(value).toLocaleString()}`,
                          "Revenue",
                        ];
                      return [value, "Reports"];
                    }}
                  />
                  <Legend />
                  {selectedMetric === "revenue" ? (
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={CHART_CYAN}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      name="Revenue"
                      yAxisId="left"
                    />
                  ) : (
                    <Area
                      type="monotone"
                      dataKey="reports"
                      stroke={CHART_AMBER}
                      fillOpacity={1}
                      fill="url(#colorReports)"
                      name="Reports"
                      yAxisId="right"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </DashboardPanel>
          )}
        </div>
      )}
    </div>
  );
}

