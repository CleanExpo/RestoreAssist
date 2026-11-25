"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardInlineNotice({
  title,
  body,
  action,
  tone = "default",
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3 sm:px-5 sm:py-4",
        tone === "danger" &&
          "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200",
        tone === "warning" &&
          "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
        tone === "default" && "border-border bg-muted/40 text-foreground",
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1 text-sm opacity-90">{body}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
