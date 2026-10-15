import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DASHBOARD_PAGE_MAX_WIDTH } from "@/lib/dashboard/simple-dashboard-theme";

type Props = {
  children: ReactNode;
  className?: string;
};

/** max-w-9xl content column; mesh gradient is on DashboardShell main. */
export function SimpleDashboardPageFrame({ children, className }: Props) {
  return (
    <div
      className={cn(
        "relative isolate mx-auto min-w-0 w-full",
        DASHBOARD_PAGE_MAX_WIDTH,
        className,
      )}
    >
      {children}
    </div>
  );
}
