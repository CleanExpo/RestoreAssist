"use client";

import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const TooltipAny = Tooltip as any;

interface DamageType {
  name: string;
  value: number;
  color?: string;
}

interface DamageTypesChartProps {
  data: DamageType[];
  loading?: boolean;
}

const defaultColors: Record<string, string> = {
  Water: "#3b82f6",
  Fire: "#f97316",
  Storm: "#8b5cf6",
  Mould: "#10b981",
  Other: "#6b7280",
};

export default function DamageTypesChart({
  data,
  loading = false,
}: DamageTypesChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

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
              Loading chart...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
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
          Reports by Damage Type
        </h3>
        <div
          className={cn(
            "flex items-center justify-center h-[300px]",
            "text-muted-foreground",
          )}
        >
          No data available
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const chartData = data.map((d) => ({
    ...d,
    color: d.color || defaultColors[d.name] || "#6b7280",
  }));

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
          "font-semibold text-lg mb-4",
          "text-foreground",
        )}
      >
        Reports by Damage Type
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            onMouseEnter={(_, index) =>
              setHoveredSegment(chartData[index]?.name || null)
            }
            onMouseLeave={() => setHoveredSegment(null)}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                opacity={
                  hoveredSegment === null || hoveredSegment === entry.name
                    ? 1
                    : 0.5
                }
                style={{ transition: "opacity 0.2s" }}
              />
            ))}
          </Pie>
          <TooltipAny
            contentStyle={{
              backgroundColor: "rgb(255 255 255 / 0.95)",
              border: "1px solid rgb(229 231 235)",
              borderRadius: "8px",
              color: "#111827",
            }}
            className=""
            formatter={(value: any) => [`${value} reports`, "Count"]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend with percentages */}
      <div className="mt-6 space-y-2">
        {chartData.map((item) => (
          <div
            key={item.name}
            className={cn(
              "flex items-center justify-between p-2 rounded transition-colors",
              "hover:bg-muted/60",
            )}
            onMouseEnter={() => setHoveredSegment(item.name)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span
                className={cn(
                  "text-sm",
                  "text-foreground/90",
                )}
              >
                {item.name}
              </span>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "text-sm font-medium",
                  "text-foreground",
                )}
              >
                {item.value}
              </span>
              <span
                className={cn(
                  "text-xs ml-2",
                  "text-muted-foreground",
                )}
              >
                ({((item.value / total) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
