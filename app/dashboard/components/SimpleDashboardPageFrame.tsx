import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SIMPLE_DASHBOARD_MAX_WIDTH,
  simpleDashboardMeshGradient,
} from "@/lib/dashboard/simple-dashboard-theme";

type Props = {
  children: ReactNode;
  className?: string;
};

/** max-w-9xl page shell with the same mesh backdrop as the overview dashboard. */
export function SimpleDashboardPageFrame({ children, className }: Props) {
  return (
    <div
      className={cn(
        "relative isolate mx-auto min-w-0 w-full px-4 sm:px-6 lg:px-8",
        SIMPLE_DASHBOARD_MAX_WIDTH,
        className,
      )}
    >
      <div aria-hidden className={simpleDashboardMeshGradient} />
      {children}
    </div>
  );
}
