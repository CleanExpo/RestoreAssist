"use client";

/**
 * XeroSyncPill — RA-1112
 *
 * Surfaces the InvoiceSyncJob queue status for a given invoice so users
 * can tell whether their invoice was actually posted to Xero.
 *
 * Polls GET /api/integrations/xero/sync-status/[invoiceId] every 10 s
 * while the job is PENDING or PROCESSING, then settles once terminal.
 *
 * Returns null (no pill) when no sync job exists — meaning the user has
 * not connected Xero or has never triggered a Xero sync for this invoice.
 */

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | null;

interface SyncStatusResponse {
  status: JobStatus;
  lastError: string | null;
  updatedAt: string | null;
}

interface Props {
  invoiceId: string;
}

const POLL_INTERVAL_MS = 10_000;

export function XeroSyncPill({ invoiceId }: Props) {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/integrations/xero/sync-status/${invoiceId}`,
      );
      if (!res.ok) return;
      const json: SyncStatusResponse = await res.json();
      setData(json);
    } catch {
      // ignore — non-critical UI element
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while job is in-flight
  useEffect(() => {
    if (!data) return;
    if (data.status !== "PENDING" && data.status !== "PROCESSING") return;

    const timer = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data, fetchStatus]);

  // No job → user hasn't connected Xero or never synced this invoice
  if (!data || data.status === null) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/invoices/${invoiceId}/retry-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "XERO" }),
      });
      // Re-fetch after a short delay to pick up the new PENDING state
      setTimeout(fetchStatus, 800);
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  if (data.status === "COMPLETED") {
    return (
      <StatusBadge tone="success" ariaLabel="Synced to Xero">
        <CheckCircle className="h-3 w-3 mr-1" />
        Synced to Xero
      </StatusBadge>
    );
  }

  if (data.status === "PENDING" || data.status === "PROCESSING") {
    return (
      <StatusBadge tone="info" ariaLabel="Xero sync in progress">
        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
        Syncing…
      </StatusBadge>
    );
  }

  // FAILED
  return (
    <span className="inline-flex items-center gap-2">
      <StatusBadge tone="danger" ariaLabel="Xero sync failed">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Sync failed
      </StatusBadge>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="text-xs text-rose-600 dark:text-rose-400 underline hover:no-underline disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </span>
  );
}
