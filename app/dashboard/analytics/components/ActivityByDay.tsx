"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHART_ACCENT,
  CHART_TOOLTIP_STYLE,
} from "@/lib/charts/palette";

interface DayItem {
  day: string;
  dayNumber: number;
  reports: number;
  revenue: number;
}

interface ActivityByDayProps {
  data: DayItem[];
  loading?: boolean;
}


export default function ActivityByDay({
  data,
  loading = false,
}: ActivityByDayProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "p-6 rounded-2xl border",
          "border-neutral-200 dark:border-slate-700/60",
          "bg-white dark:bg-slate-900/50",
        )}
      >
        <div className="h-[280px] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-brand-harbour-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "p-6 rounded-2xl border",
          "border-neutral-200 dark:border-slate-700/60",
          "bg-white dark:bg-slate-900/50",
        )}
      >
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-5 h-5 text-brand-harbour-500" />
          <h3
            className={cn(
              "text-lg font-semibold",
              "text-foreground",
            )}
          >
            Activity by Day of Week
          </h3>
        </div>
        <div
          className={cn(
            "flex items-center justify-center h-[200px]",
            "text-muted-foreground",
          )}
        >
          No activity data for this period
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-6 rounded-2xl border",
        "border-neutral-200 dark:border-slate-700/60",
        "bg-white dark:bg-slate-900/50",
        "hover:border-brand-harbour-500/30",
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-brand-harbour-500" />
          <h3
            className={cn(
              "text-lg font-semibold",
              "text-foreground",
            )}
          >
            Activity by Day of Week
          </h3>
        </div>
        <span className={cn("text-xs", "text-muted-foreground")}>
          Reports created
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-neutral-200 dark:stroke-slate-700"
          />
          <XAxis
            dataKey="day"
            className="text-muted-foreground"
            style={{ fontSize: "12px" }}
            tickLine={false}
          />
          <YAxis
            className="text-muted-foreground"
            style={{ fontSize: "12px" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={
              ((value: number, _name: string, props: { payload?: DayItem }) => [
                `${value} reports · $${(props?.payload?.revenue ?? 0).toLocaleString()}`,
                "Reports · Revenue",
              ]) as any
            }
            labelFormatter={(label) => `Day: ${label}`}
          />
          <Bar
            dataKey="reports"
            name="reports"
            radius={[4, 4, 0, 0]}
            minPointSize={4}
            // One series (reports per weekday): one colour; the axis names each day.
            fill={CHART_ACCENT}
          />
        </BarChart>
      </ResponsiveContainer>
      <div
        className={cn(
          "mt-4 pt-4 border-t grid grid-cols-2 gap-2",
          "border-neutral-200 dark:border-slate-700/60",
        )}
      >
        <div>
          <p className={cn("text-xs", "text-muted-foreground")}>
            Total reports (week)
          </p>
          <p
            className={cn(
              "text-lg font-semibold",
              "text-foreground",
            )}
          >
            {data.reduce((s, d) => s + d.reports, 0)}
          </p>
        </div>
        <div>
          <p className={cn("text-xs", "text-muted-foreground")}>
            Total revenue (week pattern)
          </p>
          <p
            className={cn(
              "text-lg font-semibold",
              "text-foreground",
            )}
          >
            ${data.reduce((s, d) => s + d.revenue, 0).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
