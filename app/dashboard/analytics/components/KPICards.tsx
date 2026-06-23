"use client";

import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  DollarSign,
  BarChart3,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface KPIData {
  totalReports: {
    value: number;
    change: string;
  };
  totalRevenue: {
    value: number;
    formatted: string;
    change: string;
  };
  avgReportValue: {
    value: number;
    formatted: string;
    change: string;
  };
  avgCompletion: {
    value: string;
    formatted: string;
    change: string;
  };
  completionRate?: {
    value: number;
    formatted: string;
    change: string;
  };
  revenueGrowth?: {
    value: number;
    formatted: string;
    change: string;
  };
}

interface KPICardsProps {
  data: KPIData | null;
  loading?: boolean;
}

function TrendIcon({ change }: { change: string }): React.ReactNode {
  if (change.startsWith("+")) {
    return <TrendingUp size={16} className="text-success" />;
  } else if (change.startsWith("-")) {
    return <TrendingDown size={16} className="text-destructive" />;
  }
  return <Minus size={16} className="text-muted-foreground" />;
}

function getTrendColor(change: string): string {
  if (change.startsWith("+") || change === "0%") {
    return "text-success";
  }
  return "text-destructive";
}

export default function KPICards({ data, loading = false }: KPICardsProps) {
  const defaultData: KPIData = {
    totalReports: { value: 0, change: "0%" },
    totalRevenue: { value: 0, formatted: "$0", change: "0%" },
    avgReportValue: { value: 0, formatted: "$0", change: "0%" },
    avgCompletion: { value: "0", formatted: "0 hrs", change: "0%" },
  };

  const kpis = data || defaultData;

  const cards: Array<{
    label: string;
    value: string;
    change: string;
    icon: LucideIcon;
  }> = [
    {
      label: "Total Reports",
      value: kpis.totalReports.value.toString(),
      change: kpis.totalReports.change,
      icon: FileText,
    },
    {
      label: "Total Revenue",
      value: kpis.totalRevenue.formatted,
      change: kpis.totalRevenue.change,
      icon: DollarSign,
    },
    {
      label: "Avg Report Value",
      value: kpis.avgReportValue.formatted,
      change: kpis.avgReportValue.change,
      icon: BarChart3,
    },
    {
      label: "Avg Completion",
      value: kpis.avgCompletion.formatted,
      change: kpis.avgCompletion.change,
      icon: Clock,
    },
  ];

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-border bg-card animate-pulse"
          >
            <div className="h-4 rounded w-1/2 mb-3 bg-muted" />
            <div className="h-8 rounded w-3/4 bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={i}
            className="relative p-4 rounded-lg border border-border bg-card transition-colors hover:border-ring/60"
          >
            {/* Header with label and icon */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
              </p>
              <Icon size={18} className="text-muted-foreground" aria-hidden />
            </div>

            {/* Value and trend */}
            <div className="flex items-end justify-between">
              <p className="text-2xl lg:text-3xl font-semibold text-foreground tabular-nums">
                {card.value}
              </p>
              <div className="flex items-center gap-1">
                <TrendIcon change={card.change} />
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    getTrendColor(card.change),
                  )}
                >
                  {card.change}
                </span>
              </div>
            </div>

            {/* Optional insight text */}
            {card.change !== "0%" && (
              <p className="mt-2 text-xs text-muted-foreground">
                {card.change.startsWith("+")
                  ? "Trending up"
                  : card.change.startsWith("-")
                    ? "Trending down"
                    : "No change"}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
