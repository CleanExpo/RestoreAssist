"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Recharts Tooltip has overly strict generic types; use an escape hatch
const TooltipAny = Tooltip as any;

interface HazardMetric {
  hazardType: string;
  avgDays: number;
  count: number;
}

interface TimeSeriesPoint {
  date: string;
  avgCompletionDays: number;
}

interface CompletionMetricsProps {
  overall?: {
    avgDays: number;
    medianDays: number;
    p95Days: number;
    totalReports: number;
    completedReports?: number;
    completionRate?: number;
  };
  byHazardType?: HazardMetric[];
  timeSeries?: TimeSeriesPoint[];
  trend?: "improving" | "stable" | "declining";
  loading?: boolean;
}

export default function CompletionMetrics({
  overall,
  byHazardType = [],
  timeSeries = [],
  trend = "stable",
  loading = false,
}: CompletionMetricsProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "p-6 rounded-lg border",
          "border-neutral-200 dark:border-slate-700/60",
          "bg-white dark:bg-slate-900/50",
        )}
      >
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p
              className={cn("text-sm", "text-muted-foreground")}
            >
              Loading metrics...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const trendColor =
    trend === "improving"
      ? "text-success"
      : trend === "declining"
        ? "text-destructive"
        : "text-muted-foreground";

  const trendIcon =
    trend === "improving" ? (
      <TrendingUp size={16} />
    ) : trend === "declining" ? (
      <TrendingDown size={16} />
    ) : null;

  return (
    <div className="space-y-6">
      {/* Overall Metrics */}
      {overall && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "border-neutral-200 dark:border-slate-700/60",
            "bg-white dark:bg-slate-900/50",
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className={cn(
                "font-semibold text-lg",
                "text-foreground",
              )}
            >
              Completion Time Overview
            </h3>
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full border",
                "bg-muted/50",
                "border-neutral-200 dark:border-slate-700/60",
                trendColor,
              )}
            >
              {trendIcon}
              <span className="text-sm font-medium capitalize">
                {trend === "improving"
                  ? "Getting faster"
                  : trend === "declining"
                    ? "Getting slower"
                    : "Stable"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div
              className={cn(
                "p-4 rounded-lg border",
                "bg-muted/40",
                "border-neutral-200 dark:border-slate-600/20",
              )}
            >
              <p
                className={cn(
                  "text-xs mb-2",
                  "text-muted-foreground",
                )}
              >
                Average Days
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  "text-foreground",
                )}
              >
                {overall.avgDays.toFixed(1)}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-muted-foreground",
                )}
              >
                typical completion
              </p>
            </div>

            <div
              className={cn(
                "p-4 rounded-lg border",
                "bg-muted/40",
                "border-neutral-200 dark:border-slate-600/20",
              )}
            >
              <p
                className={cn(
                  "text-xs mb-2",
                  "text-muted-foreground",
                )}
              >
                Median Days
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  "text-foreground",
                )}
              >
                {overall.medianDays.toFixed(1)}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-muted-foreground",
                )}
              >
                50% complete by
              </p>
            </div>

            <div
              className={cn(
                "p-4 rounded-lg border",
                "bg-muted/40",
                "border-neutral-200 dark:border-slate-600/20",
              )}
            >
              <p
                className={cn(
                  "text-xs mb-2",
                  "text-muted-foreground",
                )}
              >
                95th Percentile
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  "text-foreground",
                )}
              >
                {overall.p95Days.toFixed(1)}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-muted-foreground",
                )}
              >
                max expected days
              </p>
            </div>

            <div
              className={cn(
                "p-4 rounded-lg border",
                "bg-gradient-to-br from-emerald-500/10 to-green-500/10",
                "border-emerald-200 dark:border-emerald-600/20",
              )}
            >
              <p
                className={cn(
                  "text-xs mb-2",
                  "text-muted-foreground",
                )}
              >
                Completion Rate
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  "text-success",
                )}
              >
                {overall.completionRate !== undefined
                  ? `${overall.completionRate}%`
                  : "—"}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-muted-foreground",
                )}
              >
                {overall.completedReports !== undefined
                  ? `${overall.completedReports}/${overall.totalReports}`
                  : `${overall.totalReports} total`}
              </p>
            </div>

            <div
              className={cn(
                "p-4 rounded-lg border",
                "bg-muted/40",
                "border-neutral-200 dark:border-slate-600/20",
              )}
            >
              <p
                className={cn(
                  "text-xs mb-2",
                  "text-muted-foreground",
                )}
              >
                Total Reports
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold",
                  "text-foreground",
                )}
              >
                {overall.totalReports}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  "text-muted-foreground",
                )}
              >
                in period
              </p>
            </div>
          </div>
        </div>
      )}

      {/* By Hazard Type */}
      {byHazardType && byHazardType.length > 0 && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "border-neutral-200 dark:border-slate-700/60",
            "bg-white dark:bg-slate-900/50",
          )}
        >
          <h3
            className={cn(
              "font-semibold text-lg mb-4",
              "text-foreground",
            )}
          >
            Completion Time by Hazard Type
          </h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byHazardType}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
              />
              <XAxis
                dataKey="hazardType"
                className="text-muted-foreground"
                style={{ fontSize: "12px" }}
              />
              <YAxis
                className="text-muted-foreground"
                style={{ fontSize: "12px" }}
                label={{
                  value: "Days",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fill: "rgb(75 85 99)" },
                }}
              />
              <TooltipAny
                contentStyle={{
                  backgroundColor: "rgb(255 255 255 / 0.95)",
                  border: "1px solid rgb(229 231 235)",
                  borderRadius: "8px",
                  color: "#111827",
                }}
                className=""
                formatter={(value: any) => [
                  `${(value as number).toFixed(1)} days`,
                  "Avg Time",
                ]}
              />
              <Legend />
              <Bar
                dataKey="avgDays"
                fill="#f59e0b"
                name="Average Days"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>

          {/* Hazard type list with rankings */}
          <div className="mt-6 space-y-2">
            {byHazardType
              .sort((a, b) => a.avgDays - b.avgDays)
              .map((hazard, index) => (
                <div
                  key={hazard.hazardType}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border transition-colors",
                    "bg-muted/30",
                    "border-neutral-200 dark:border-slate-600/20",
                    "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-sm font-semibold min-w-[2rem]",
                        "text-muted-foreground",
                      )}
                    >
                      #{index + 1}
                    </span>
                    <div>
                      <p
                        className={cn(
                          "font-medium",
                          "text-foreground",
                        )}
                      >
                        {hazard.hazardType}
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          "text-muted-foreground",
                        )}
                      >
                        {hazard.count} reports
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-cyan-600 dark:text-cyan-400">
                      {hazard.avgDays.toFixed(1)} days
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Time Series Trend */}
      {timeSeries && timeSeries.length > 0 && (
        <div
          className={cn(
            "p-6 rounded-lg border",
            "border-neutral-200 dark:border-slate-700/60",
            "bg-white dark:bg-slate-900/50",
          )}
        >
          <h3
            className={cn(
              "font-semibold text-lg mb-4",
              "text-foreground",
            )}
          >
            Completion Time Trend
          </h3>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeries}>
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
              />
              <XAxis
                dataKey="date"
                className="text-muted-foreground"
                style={{ fontSize: "12px" }}
                angle={timeSeries.length > 10 ? -45 : 0}
                textAnchor={timeSeries.length > 10 ? "end" : "middle"}
                height={timeSeries.length > 10 ? 80 : 30}
              />
              <YAxis
                className="text-muted-foreground"
                style={{ fontSize: "12px" }}
                label={{
                  value: "Days",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fill: "rgb(75 85 99)" },
                }}
              />
              <TooltipAny
                contentStyle={{
                  backgroundColor: "rgb(255 255 255 / 0.95)",
                  border: "1px solid rgb(229 231 235)",
                  borderRadius: "8px",
                  color: "#111827",
                }}
                className=""
                formatter={(value: any) =>
                  `${(value as number).toFixed(1)} days`
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="avgCompletionDays"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                name="Avg Completion Days"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Insight */}
          {trend !== "stable" && (
            <div
              className={cn(
                "mt-4 p-3 rounded-lg flex gap-2 border",
                trend === "improving"
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                  : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20",
              )}
            >
              <AlertCircle
                size={16}
                className={
                  trend === "improving"
                    ? "text-success"
                    : "text-destructive"
                }
              />
              <p
                className={cn(
                  "text-sm",
                  trend === "improving"
                    ? "text-success"
                    : "text-destructive",
                )}
              >
                {trend === "improving"
                  ? "Great progress! Your completion times are getting faster."
                  : "Your completion times are increasing. Consider reviewing your workflow."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
