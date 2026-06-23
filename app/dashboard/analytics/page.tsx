"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  BarChart3,
  Activity,
  Zap,
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
import { UserCog, Wrench } from "lucide-react";

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
        }

        if (completionRes.ok) {
          const completionJson = await completionRes.json();
          setCompletionData(completionJson);
        }

        if (activityFeedRes.ok) {
          const activityFeedJson = await activityFeedRes.json();
          setActivityFeedData(activityFeedJson);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Page header */}
      <div className="p-4 border-b border-border bg-card">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reports, revenue, and completion trends across your team.
        </p>
        <div className="mt-4">
          <AnalyticsFilters
            onFiltersChange={setFilters}
            isLoading={loading}
            onExport={handleExport}
          />
        </div>
      </div>

      <div className=" mx-auto px-4  py-8 space-y-8">
        {/* Selected Team Member Indicator (Admin and Manager) */}
        {selectedMember &&
          (session?.user?.role === "ADMIN" ||
            session?.user?.role === "MANAGER") && (
            <div
              className={cn(
                "p-4 rounded-xl border animate-in slide-in-from-top-4",
                "bg-card border-border",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg",
                    selectedMember.role === "MANAGER"
                      ? "bg-blue-100 dark:bg-blue-900/30"
                      : "bg-cyan-100 dark:bg-cyan-900/30",
                  )}
                >
                  {selectedMember.role === "MANAGER" ? (
                    <UserCog className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <Wrench className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  )}
                </div>
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      "text-neutral-700 dark:text-neutral-300",
                    )}
                  >
                    Viewing analytics for:{" "}
                    <strong>
                      {selectedMember.name || selectedMember.email}
                    </strong>
                  </p>
                  <p
                    className={cn(
                      "text-xs mt-0.5",
                      "text-neutral-600 dark:text-neutral-400",
                    )}
                  >
                    {selectedMember.role === "MANAGER"
                      ? "Manager"
                      : "Technician"}{" "}
                    • {selectedMember.email}
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Error Alert with Animation */}
        {error && (
          <div className="animate-in slide-in-from-top-4 duration-300">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
                <p className="font-medium text-destructive">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State with Enhanced Design */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[600px]">
            <div className="text-center space-y-6">
              <div className="relative">
                <div
                  className={cn(
                    "w-20 h-20 border-4 rounded-full",
                    "border-neutral-300 dark:border-slate-700",
                  )}
                ></div>
                <div className="w-20 h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
              </div>
              <div className="space-y-2">
                <p
                  className={cn(
                    "text-lg font-semibold",
                    "text-neutral-900 dark:text-slate-200",
                  )}
                >
                  Loading Analytics
                </p>
                <p
                  className={cn(
                    "text-sm",
                    "text-neutral-600 dark:text-slate-400",
                  )}
                >
                  Gathering insights from your data...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Quick Insights Bar */}
            {insights && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-75">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs mb-1 text-muted-foreground">
                          Growth Rate
                        </p>
                        <p
                          className={cn(
                            "text-2xl font-bold tabular-nums",
                            insights.isGrowing
                              ? "text-success"
                              : "text-destructive",
                          )}
                        >
                          {insights.revenueGrowth > 0 ? "+" : ""}
                          {insights.revenueGrowth.toFixed(1)}%
                        </p>
                      </div>
                      {insights.isGrowing ? (
                        <TrendingUp className="w-8 h-8 text-success" />
                      ) : (
                        <TrendingDown className="w-8 h-8 text-destructive" />
                      )}
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs mb-1 text-muted-foreground">
                          Efficiency Score
                        </p>
                        <p className="text-2xl font-bold text-foreground tabular-nums">
                          {insights.efficiencyScore}%
                        </p>
                      </div>
                      <Zap className="w-8 h-8 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs mb-1 text-muted-foreground">
                          Top Hazard Type
                        </p>
                        <p className="text-lg font-bold text-foreground">
                          {insights.topHazard}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {insights.topHazardCount} reports
                        </p>
                      </div>
                      <Activity className="w-8 h-8 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs mb-1 text-muted-foreground">
                          Avg Value/Report
                        </p>
                        <p className="text-lg font-bold text-foreground tabular-nums">
                          ${(insights.avgValuePerReport / 1000).toFixed(1)}K
                        </p>
                      </div>
                      <DollarSign className="w-8 h-8 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RA-1208: AI-generated "what changed this period" narrative */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-50">
              <AINarrativeCard
                period={
                  filters.dateRange === "90days"
                    ? "quarter"
                    : filters.dateRange === "ytd"
                      ? "year"
                      : "month"
                }
              />
            </div>

            {/* Executive Summary - Next-level insight */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-75">
              <ExecutiveSummary
                summary={insightsData?.summary ?? ""}
                periodLabel={
                  filters.dateRange === "7days"
                    ? "Last 7 days"
                    : filters.dateRange === "30days"
                      ? "Last 30 days"
                      : filters.dateRange === "90days"
                        ? "Last 90 days"
                        : "Year to date"
                }
                loading={loading}
              />
            </div>

            {/* KPI Cards Section */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-100">
              <KPICards data={data?.kpis || null} />
            </div>

            {/* Period Comparison + Report Pipeline + Activity by Day */}
            <div className="grid lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-125">
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

            {/* Top Movers & Turnaround (from insights API) */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
              <InsightsMovers
                topGrowingClients={insightsData?.topGrowingClients ?? []}
                slowestHazards={insightsData?.slowestHazards ?? []}
                fastestHazards={insightsData?.fastestHazards ?? []}
                loading={loading}
              />
            </div>

            {/* Billing Overview (Admin Only) */}
            {session?.user?.role === "ADMIN" && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-150">
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-emerald-500/30",
                  )}
                >
                  <BillingOverview />
                </div>
              </div>
            )}

            {/* Main Revenue Chart with Enhanced Styling */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-200">
              <div
                className={cn(
                  "backdrop-blur-sm rounded-2xl shadow-2xl p-6 transition-all duration-300",
                  "bg-white/50 dark:bg-slate-800/50",
                  "border border-neutral-200 dark:border-slate-700/50",
                  "hover:border-cyan-500/30",
                )}
              >
                <RevenueChart
                  data={data?.reportTrendData || []}
                  dateRange={filters.dateRange}
                />
              </div>
            </div>

            {/* Charts Grid with Better Layout */}
            <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-300">
              {/* Damage Types Chart */}
              <div
                className={cn(
                  "backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 overflow-hidden",
                  "bg-white/50 dark:bg-slate-800/50",
                  "border border-neutral-200 dark:border-slate-700/50",
                  "hover:border-purple-500/30",
                )}
              >
                <DamageTypesChart data={data?.hazardDistribution || []} />
              </div>

              {/* Insurance Type Chart with Visual Bar */}
              {data?.insuranceTypeData && data.insuranceTypeData.length > 0 && (
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-blue-500/30",
                  )}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3
                      className={cn(
                        "text-lg font-semibold",
                        "text-neutral-900 dark:text-slate-200",
                      )}
                    >
                      Insurance Distribution
                    </h3>
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                  </div>

                  {/* Bar Chart Visualization */}
                  <div className="space-y-4 mb-4">
                    {data.insuranceTypeData.map((item, idx) => {
                      const maxCount = Math.max(
                        ...data.insuranceTypeData.map((i) => i.count),
                      );
                      const percentage = (item.count / maxCount) * 100;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "text-sm font-medium",
                                "text-neutral-700 dark:text-slate-300",
                              )}
                            >
                              {item.type || "Unknown"}
                            </span>
                            <span className="text-sm font-bold text-cyan-400">
                              {item.count}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "w-full rounded-full h-2.5 overflow-hidden",
                              "bg-neutral-200 dark:bg-slate-700/30",
                            )}
                          >
                            <div
                              className="h-full bg-info rounded-full transition-all duration-1000"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Count */}
                  <div
                    className={cn(
                      "pt-4 border-t",
                      "border-neutral-200 dark:border-slate-700/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        Total Insurance Types
                      </span>
                      <span className="text-lg font-bold text-blue-400">
                        {data.insuranceTypeData.length}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Additional Metrics Row */}
            <div className="grid lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-350">
              {/* State Performance with Chart */}
              {data?.statePerformance && data.statePerformance.length > 0 && (
                <div
                  className={cn(
                    "lg:col-span-2 backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-amber-500/30",
                  )}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3
                      className={cn(
                        "text-lg font-semibold",
                        "text-neutral-900 dark:text-slate-200",
                      )}
                    >
                      Performance by State
                    </h3>
                    <Activity className="w-5 h-5 text-warning" />
                  </div>

                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.statePerformance.slice(0, 8)}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-neutral-300 dark:stroke-slate-700"
                      />
                      <XAxis
                        dataKey="state"
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                      />
                      <TooltipAny
                        contentStyle={{
                          backgroundColor: "rgb(255 255 255 / 0.95)",
                          border: "1px solid rgb(229 231 235)",
                          borderRadius: "8px",
                          color: "#111827",
                        }}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                        formatter={(value: any) => [
                          `${value} reports`,
                          "Count",
                        ]}
                      />
                      <Bar dataKey="value" fill="#f59e0b" radius={[8, 8, 0, 0]}>
                        {data.statePerformance
                          .slice(0, 8)
                          .map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={`hsl(${30 + index * 15}, 70%, 50%)`}
                            />
                          ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Turnaround Time Summary */}
              {data?.turnaroundTime && data.turnaroundTime.length > 0 && (
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-orange-500/30",
                  )}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3
                      className={cn(
                        "text-lg font-semibold",
                        "text-neutral-900 dark:text-slate-200",
                      )}
                    >
                      Turnaround Time
                    </h3>
                    <Clock className="w-5 h-5 text-orange-400" />
                  </div>

                  <div className="space-y-4">
                    {data.turnaroundTime.slice(0, 5).map((item, idx) => {
                      const maxHours = Math.max(
                        ...data.turnaroundTime.map((t) => t.hours),
                      );
                      const percentage = (item.hours / maxHours) * 100;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "text-sm font-medium",
                                "text-neutral-700 dark:text-slate-300",
                              )}
                            >
                              {item.hazard}
                            </span>
                            <span className="text-sm font-bold text-orange-500 dark:text-orange-400">
                              {item.hours.toFixed(1)}h
                            </span>
                          </div>
                          <div
                            className={cn(
                              "w-full rounded-full h-2 overflow-hidden",
                              "bg-neutral-200 dark:bg-slate-700/30",
                            )}
                          >
                            <div
                              className="h-full bg-warning rounded-full transition-all duration-1000"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {data.turnaroundTime.length > 5 && (
                    <div
                      className={cn(
                        "mt-4 pt-4 border-t text-center",
                        "border-neutral-200 dark:border-slate-700/50",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        +{data.turnaroundTime.length - 5} more hazard types
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Revenue Projection - Full Width with Enhanced Design */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-400">
              <div
                className={cn(
                  "backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
                  "bg-white/50 dark:bg-slate-800/50",
                  "border border-neutral-200 dark:border-slate-700/50",
                  "hover:border-cyan-500/30",
                )}
              >
                {projectionData ? (
                  <RevenueProjection
                    historical={projectionData.historical}
                    projected={projectionData.projected}
                    trend={projectionData.trend}
                  />
                ) : (
                  <div className="p-12 flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
                      <p className={cn("text-neutral-600 dark:text-slate-400")}>
                        Calculating revenue forecast...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Metrics Grid */}
            <div className="grid lg:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 duration-500 delay-500">
              {/* Top Clients */}
              <div
                className={cn(
                  "backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 overflow-hidden",
                  "bg-white/50 dark:bg-slate-800/50",
                  "border border-neutral-200 dark:border-slate-700/50",
                  "hover:border-emerald-500/30",
                )}
              >
                <TopClientsTable
                  data={
                    data?.topClients?.map((client) => ({
                      name: client.name,
                      reports: client.reports,
                      revenue: client.revenue,
                    })) || []
                  }
                />
              </div>

              {/* State Performance (if available) */}
              {data?.statePerformance && data.statePerformance.length > 0 && (
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-amber-500/30",
                  )}
                >
                  <h3
                    className={cn(
                      "text-lg font-semibold mb-4",
                      "text-neutral-900 dark:text-slate-200",
                    )}
                  >
                    Performance by State
                  </h3>
                  <div className="space-y-3">
                    {data.statePerformance.slice(0, 5).map((state, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg",
                          "bg-neutral-100 dark:bg-slate-700/30",
                        )}
                      >
                        <span
                          className={cn(
                            "font-medium",
                            "text-neutral-700 dark:text-slate-300",
                          )}
                        >
                          {state.state || "Unknown"}
                        </span>
                        <span className="text-warning font-semibold">
                          {state.value} reports
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Monthly Volume Chart */}
            <div className="animate-in slide-in-from-bottom-4 duration-500 delay-550">
              <div
                className={cn(
                  "backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
                  "bg-white/50 dark:bg-slate-800/50",
                  "border border-neutral-200 dark:border-slate-700/50",
                  "hover:border-cyan-500/30",
                )}
              >
                <MonthlyVolumeChart userId={filters.userId} months={12} />
              </div>
            </div>

            {/* Completion Metrics - Full Width */}
            {completionData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-600">
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-purple-500/30",
                  )}
                >
                  <CompletionMetrics
                    overall={completionData.overall}
                    byHazardType={completionData.byHazardType}
                    timeSeries={completionData.timeSeries}
                    trend={completionData.trend}
                  />
                </div>
              </div>
            )}

            {/* Billing Overview - Admin Only (fetches its own data) */}
            {isAdmin && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-700">
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-emerald-500/30",
                  )}
                >
                  <BillingOverview />
                </div>
              </div>
            )}

            {/* Team Activity Feed - Full Width */}
            {activityFeedData && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-900">
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-cyan-500/30",
                  )}
                >
                  <ActivityFeed activities={activityFeedData.activities} />
                </div>
              </div>
            )}

            {/* Revenue Trend Analysis */}
            {data?.reportTrendData && data.reportTrendData.length > 0 && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-700">
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl shadow-xl transition-all duration-300 p-6",
                    "bg-white/50 dark:bg-slate-800/50",
                    "border border-neutral-200 dark:border-slate-700/50",
                    "hover:border-indigo-500/30",
                  )}
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3
                      className={cn(
                        "text-lg font-semibold",
                        "text-neutral-900 dark:text-slate-200",
                      )}
                    >
                      Revenue vs Reports Trend
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedMetric("revenue")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95",
                          selectedMetric === "revenue"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                        title="View revenue metrics"
                      >
                        Revenue
                      </button>
                      <button
                        onClick={() => setSelectedMetric("reports")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95",
                          selectedMetric === "reports"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                        )}
                        title="View report metrics"
                      >
                        Reports
                      </button>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data.reportTrendData}>
                      <defs>
                        <linearGradient
                          id="colorRevenue"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#6366f1"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="#6366f1"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorReports"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8b5cf6"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8b5cf6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-neutral-300 dark:stroke-slate-700"
                      />
                      <XAxis
                        dataKey="date"
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        angle={data.reportTrendData.length > 10 ? -45 : 0}
                        textAnchor={
                          data.reportTrendData.length > 10 ? "end" : "middle"
                        }
                        height={data.reportTrendData.length > 10 ? 80 : 30}
                      />
                      <YAxis
                        yAxisId="left"
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        label={
                          selectedMetric === "revenue"
                            ? {
                                value: "Revenue ($)",
                                angle: -90,
                                position: "insideLeft",
                                style: {
                                  textAnchor: "middle",
                                  fill: "rgb(75 85 99)",
                                },
                              }
                            : undefined
                        }
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        className="text-neutral-600 dark:text-slate-400"
                        style={{ fontSize: "12px" }}
                        label={
                          selectedMetric === "reports"
                            ? {
                                value: "Reports",
                                angle: 90,
                                position: "insideRight",
                                style: {
                                  textAnchor: "middle",
                                  fill: "rgb(75 85 99)",
                                },
                              }
                            : undefined
                        }
                      />
                      <TooltipAny
                        contentStyle={{
                          backgroundColor: "rgb(255 255 255 / 0.95)",
                          border: "1px solid rgb(229 231 235)",
                          borderRadius: "8px",
                          color: "#111827",
                        }}
                        className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
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
                          stroke="#6366f1"
                          fillOpacity={1}
                          fill="url(#colorRevenue)"
                          name="Revenue"
                          yAxisId="left"
                        />
                      ) : (
                        <Area
                          type="monotone"
                          dataKey="reports"
                          stroke="#8b5cf6"
                          fillOpacity={1}
                          fill="url(#colorReports)"
                          name="Reports"
                          yAxisId="right"
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Summary Stats Footer */}
            {data && (
              <div className="animate-in slide-in-from-bottom-4 duration-500 delay-800">
                <div
                  className={cn(
                    "backdrop-blur-sm rounded-2xl p-6",
                    "bg-white/50 dark:bg-slate-800/30",
                    "border border-neutral-200 dark:border-slate-700/30",
                  )}
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 mb-3">
                        <FileText className="w-6 h-6 text-blue-400" />
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-bold",
                          "text-neutral-900 dark:text-slate-200",
                        )}
                      >
                        {data.kpis.totalReports.value}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        Total Reports
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-3">
                        <DollarSign className="w-6 h-6 text-success" />
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-bold",
                          "text-neutral-900 dark:text-slate-200",
                        )}
                      >
                        {data.kpis.totalRevenue.formatted}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        Total Revenue
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-info/10 mb-3">
                        <BarChart3 className="w-6 h-6 text-info" />
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-bold",
                          "text-neutral-900 dark:text-slate-200",
                        )}
                      >
                        {data.hazardDistribution.length}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        Hazard Types
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/10 mb-3">
                        <Clock className="w-6 h-6 text-orange-400" />
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-bold",
                          "text-neutral-900 dark:text-slate-200",
                        )}
                      >
                        {data.kpis.avgCompletion.formatted}
                      </p>
                      <p
                        className={cn(
                          "text-xs mt-1",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        Avg Completion
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State — RA-1207: also fires when `data` is a valid object
                whose underlying report set is empty (API returns zeros, not null).
                Previous gate `!data && !loading` never matched that case, so
                new tenants saw a page of zero-value insights instead of onboarding. */}
            {!loading &&
              (!data ||
                (data.kpis?.totalReports?.value ?? 0) === 0 ||
                ((data.reportTrendData?.length ?? 0) === 0 &&
                  (data.statePerformance?.length ?? 0) === 0)) && (
                <div className="text-center py-16 animate-in fade-in duration-500">
                  <div
                    className={cn(
                      "inline-flex items-center justify-center w-24 h-24 rounded-full border mb-6",
                      "bg-white/50 dark:bg-slate-800/50",
                      "border-neutral-200 dark:border-slate-700/50",
                    )}
                  >
                    <BarChart3
                      className={cn(
                        "w-12 h-12",
                        "text-neutral-500 dark:text-slate-400",
                      )}
                    />
                  </div>
                  <h3
                    className={cn(
                      "text-2xl font-semibold mb-2",
                      "text-neutral-900 dark:text-slate-300",
                    )}
                  >
                    No reports yet
                  </h3>
                  <p
                    className={cn(
                      "mb-6 max-w-md mx-auto",
                      "text-neutral-600 dark:text-slate-400",
                    )}
                  >
                    Create your first report to see revenue trends, performance
                    metrics, and analytics insights here.
                  </p>
                  <Link
                    href="/dashboard/reports/new"
                    className={cn(
                      "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium mb-6",
                      "bg-cyan-600 hover:bg-cyan-700 text-white transition-colors",
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    Create your first report
                  </Link>
                  <div
                    className={cn(
                      "flex items-center justify-center gap-4 text-sm",
                      "text-neutral-500 dark:text-slate-500",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Revenue tracking</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Performance metrics</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Trend analysis</span>
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
