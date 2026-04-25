"use client";

/**
 * IntegrationHealthBanner — RA-1557
 *
 * Shown in the dashboard sidebar when any integration is in ERROR state or
 * a CONNECTED integration hasn't synced in over 24 hours. Dismissable per
 * session. Links to /dashboard/integrations.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "ra-1557-integration-health-dismissed";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

export function IntegrationHealthBanner({
  sidebarOpen,
}: {
  sidebarOpen: boolean;
}) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) {
      setDismissed(true);
      return;
    }
    fetch("/api/integrations/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.status && data.status !== "healthy") {
          setHealthStatus(data.status as HealthStatus);
        }
      })
      .catch((err) => console.error("[IntegrationHealthBanner]", err));
  }, []);

  if (!sidebarOpen || dismissed || !healthStatus) return null;

  const isUnhealthy = healthStatus === "unhealthy";

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      className={cn(
        "mx-2 mt-2 mb-1 rounded-lg px-3 py-2 flex items-start gap-2 text-xs",
        isUnhealthy
          ? "bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400"
          : "bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",
      )}
    >
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-snug">
          {isUnhealthy ? "Integration error" : "Integration issue"}
        </p>
        <Link
          href="/dashboard/integrations"
          className="underline underline-offset-2 hover:opacity-80 leading-snug block truncate"
        >
          Check integrations →
        </Link>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss integration health warning"
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={13} />
      </button>
    </div>
  );
}
