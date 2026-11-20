"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHART_NEUTRAL,
  CHART_SERIES,
  CHART_STATUS,
  CHART_TOOLTIP_STYLE,
} from "@/lib/charts/palette";

// Historical revenue takes slot 1 as revenue does across analytics; the
// projection takes slot 2 and a dashed line, so it never reads as recorded.
const HISTORICAL_COLOUR = CHART_SERIES[0];
const PROJECTED_COLOUR = CHART_SERIES[1];

const TooltipAny = Tooltip as any;

interface ProjectionData {
  date: string;
  revenue: number;
  isProjected: boolean;
  confidence?: number;
}

interface RevenueProjectionProps {
  historical: Array<{ date: string; revenue: number }>;
  projected: ProjectionData[];
  trend?: "improving" | "stable" | "declining";
  loading?: boolean;
}

export default function RevenueProjection({
  historical,
  projected,
  trend = "stable",
  loading = false,
}: RevenueProjectionProps) {
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
            <Loader2 className="w-8 h-8 text-brand-harbour-500 animate-spin mx-auto" />
            <p
              className={cn("text-sm", "text-muted-foreground")}
            >
              Calculating projections...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const combinedData = [
    ...historical.map((d) => ({ ...d, type: "historical" })),
    ...projected.map((d) => ({ ...d, type: "projected" })),
  ];

  if (!combinedData || combinedData.length === 0) {
    return (
      <div
        className={cn(
          "p-6 rounded-lg border",
          "border-neutral-200 dark:border-slate-700/60",
          "bg-white dark:bg-slate-900/50",
        )}
      >
        <h3
          className={cn(
            "font-semibold mb-4",
            "text-foreground",
          )}
        >
          30/60/90 Day Revenue Forecast
        </h3>
        <div
          className={cn(
            "flex items-center justify-center h-[300px]",
            "text-muted-foreground",
          )}
        >
          Not enough historical data for projection
        </div>
      </div>
    );
  }

  // The trend is a state, so it wears status colours; trendLabel names it.
  const trendColor =
    trend === "improving"
      ? CHART_STATUS.good
      : trend === "declining"
        ? CHART_STATUS.warning
        : CHART_NEUTRAL;

  const trendLabel =
    trend === "improving"
      ? "Improving"
      : trend === "declining"
        ? "Declining"
        : "Stable";

  const TrendIcon =
    trend === "improving"
      ? TrendingUp
      : trend === "declining"
        ? TrendingDown
        : ArrowRight;

  return (
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
          30/60/90 Day Revenue Forecast
        </h3>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full border",
            "bg-muted/50",
            "border-neutral-200 dark:border-slate-700/60",
          )}
        >
          {/* The icon carries the status colour; the label stays in text ink
              so it reads at full contrast in both modes. */}
          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            <TrendIcon size={14} aria-hidden="true" style={{ color: trendColor }} />
            {trendLabel}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={combinedData}>
          <defs>
            <linearGradient id="colorHistorical" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={HISTORICAL_COLOUR} stopOpacity={0.8} />
              <stop offset="95%" stopColor={HISTORICAL_COLOUR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PROJECTED_COLOUR} stopOpacity={0.4} />
              <stop offset="95%" stopColor={PROJECTED_COLOUR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-border"
          />
          <XAxis
            dataKey="date"
            className="text-muted-foreground"
            style={{ fontSize: "12px" }}
            angle={combinedData.length > 15 ? -45 : 0}
            textAnchor={combinedData.length > 15 ? "end" : "middle"}
            height={combinedData.length > 15 ? 80 : 30}
          />
          <YAxis
            className="text-muted-foreground"
            style={{ fontSize: "12px" }}
          />
          <TooltipAny
            contentStyle={CHART_TOOLTIP_STYLE}
            className=""
            formatter={(value: any) => `$${(value as number).toLocaleString()}`}
            labelFormatter={(label: any) => `Date: ${label}`}
          />
          <Legend />

          {/* Historical data */}
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={HISTORICAL_COLOUR}
            fill="url(#colorHistorical)"
            name="Historical Revenue"
            data={combinedData.filter((d) => d.type === "historical")}
            isAnimationActive={false}
          />

          {/* Projected data with different styling */}
          <Line
            type="monotone"
            dataKey="revenue"
            stroke={PROJECTED_COLOUR}
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Projected Revenue"
            data={combinedData.filter((d) => d.type === "projected")}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Projection Summary */}
      <div
        className={cn(
          "mt-6 grid grid-cols-3 gap-4 p-4 rounded-lg border",
          "bg-muted/30",
          "border-neutral-200 dark:border-slate-600/20",
        )}
      >
        <div>
          <p
            className={cn(
              "text-xs mb-1",
              "text-muted-foreground",
            )}
          >
            30-Day Projection
          </p>
          <p className="text-lg font-semibold text-brand-harbour-600 dark:text-brand-harbour-400">
            $
            {(
              projected.slice(0, 30).reduce((sum, p) => sum + p.revenue, 0) || 0
            ).toLocaleString()}
          </p>
        </div>
        <div>
          <p
            className={cn(
              "text-xs mb-1",
              "text-muted-foreground",
            )}
          >
            60-Day Projection
          </p>
          <p className="text-lg font-semibold text-brand-harbour-600 dark:text-brand-harbour-400">
            $
            {(
              projected.slice(0, 60).reduce((sum, p) => sum + p.revenue, 0) || 0
            ).toLocaleString()}
          </p>
        </div>
        <div>
          <p
            className={cn(
              "text-xs mb-1",
              "text-muted-foreground",
            )}
          >
            90-Day Projection
          </p>
          <p className="text-lg font-semibold text-brand-harbour-600 dark:text-brand-harbour-400">
            $
            {(
              projected.slice(0, 90).reduce((sum, p) => sum + p.revenue, 0) || 0
            ).toLocaleString()}
          </p>
        </div>
      </div>

      <p className={cn("text-xs mt-4", "text-muted-foreground")}>
        Projections are based on linear regression analysis of historical data.
        Confidence decreases as predictions extend further into the future.
      </p>
    </div>
  );
}
