"use client";

import { cn } from "@/lib/utils";
import type { DataSource } from "@/lib/synced-data/types";

const OPTIONS: Array<{ value: DataSource; label: string }> = [
  { value: "native", label: "RestoreAssist" },
  { value: "xero", label: "Xero" },
  { value: "ascora", label: "Ascora" },
];

interface DataSourceSwitcherProps {
  value: DataSource;
  onChange: (source: DataSource) => void;
  className?: string;
  id?: string;
}

export function DataSourceSwitcher({
  value,
  onChange,
  className,
  id = "data-source",
}: DataSourceSwitcherProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label
        htmlFor={id}
        className="text-sm text-neutral-600 dark:text-slate-400 whitespace-nowrap"
      >
        Source
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as DataSource)}
        aria-label="Data source"
        className={cn(
          "px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm min-w-[10rem]",
          "bg-neutral-100 dark:bg-slate-800",
          "border-neutral-300 dark:border-slate-700",
          "text-neutral-900 dark:text-white",
        )}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
