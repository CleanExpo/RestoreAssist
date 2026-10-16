"use client";

import type { ReactNode } from "react";
import PortalNav from "@/components/portal/PortalNav";
import { cn } from "@/lib/utils";
import {
  CLIENT_PORTAL_MAX_WIDTH,
  clientPortalMeshGradient,
  clientPortalPageShell,
} from "@/lib/portal/client-portal-theme";

export function ClientPortalAccountLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clientPortalPageShell}>
      <div aria-hidden className={clientPortalMeshGradient} />
      <PortalNav />
      <div
        className={cn(
          "relative mx-auto min-w-0 px-4 py-8 sm:px-6",
          CLIENT_PORTAL_MAX_WIDTH,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
