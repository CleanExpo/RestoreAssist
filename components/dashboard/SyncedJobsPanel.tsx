"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Eye, Loader2, Plug } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import {
  DASHBOARD_LIST_PAGE_SIZE,
  ListPagination,
} from "@/components/dashboard/ListPagination";
import { cn } from "@/lib/utils";
import type {
  ExternalDataSource,
  SyncedJobRow,
  SyncedListPagination,
  SyncedListResponse,
} from "@/lib/synced-data/types";

const STATUS_TONES: Record<string, StatusTone> = {
  COMPLETED: "success",
  PAID: "success",
  INVOICED: "success",
  ACTIVE: "info",
  IN_PROGRESS: "info",
  PENDING: "warning",
  DRAFT: "neutral",
  QUOTE: "neutral",
};

interface SyncedJobsPanelProps {
  source: ExternalDataSource;
  searchTerm: string;
}

export function SyncedJobsPanel({ source, searchTerm }: SyncedJobsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [message, setMessage] = useState<string | undefined>();
  const [items, setItems] = useState<SyncedJobRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<SyncedListPagination>({
    page: 1,
    pageSize: DASHBOARD_LIST_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [importingId, setImportingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SyncedJobRow | null>(null);

  // Reset to page 1 when source or search changes.
  useEffect(() => {
    setPage(1);
  }, [source, searchTerm]);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        source,
        page: String(page),
        pageSize: String(DASHBOARD_LIST_PAGE_SIZE),
      });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());

      const res = await fetch(`/api/synced/jobs?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setItems([]);
        setConnected(false);
        setPagination({
          page: 1,
          pageSize: DASHBOARD_LIST_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        });
        setError(body.error || body.message || "Failed to load synced jobs");
        return;
      }

      const data = (await res.json()) as SyncedListResponse<SyncedJobRow>;
      setItems(data.items);
      setConnected(data.connected);
      setMessage(data.message);
      setPagination(data.pagination);
      if (
        data.pagination.totalPages > 0 &&
        page > data.pagination.totalPages
      ) {
        setPage(data.pagination.totalPages);
      }
    } catch {
      setItems([]);
      setError("Failed to load synced jobs");
    } finally {
      setLoading(false);
    }
  }, [source, searchTerm, page]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const importJob = async (row: SyncedJobRow) => {
    if (!row.canImport || row.source !== "xero") return;
    try {
      setImportingId(row.id);
      const res = await fetch("/api/integrations/oauth/xero/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: [row.externalId] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || body.message || "Import failed");
        return;
      }
      toast.success(body.message || "Job imported as report");
      void fetchItems();
    } catch {
      toast.error("Import failed");
    } finally {
      setImportingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 mb-4">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => void fetchItems()}>
          Retry
        </button>
      </div>
    );
  }

  if (!connected || (items.length === 0 && pagination.total === 0)) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
        <EmptyState
          icon={<Plug className="h-10 w-10" aria-hidden />}
          title={
            !connected
              ? `No ${source === "xero" ? "Xero" : "Ascora"} connection`
              : searchTerm
                ? "No matching synced jobs"
                : `No ${source === "xero" ? "Xero" : "Ascora"} jobs synced yet`
          }
          description={
            message ||
            (!connected
              ? "Sync from Integrations first to browse jobs here."
              : searchTerm
                ? undefined
                : "Sync from Integrations first to see jobs here.")
          }
          primaryAction={
            searchTerm
              ? undefined
              : {
                  label: "Open Integrations",
                  href: "/dashboard/integrations",
                }
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
        <div className="sm:hidden space-y-3 p-4">
          {items.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-4"
            >
              <div className="font-medium text-white">{row.title}</div>
              {row.clientName && (
                <div className="text-sm text-slate-400">{row.clientName}</div>
              )}
              {row.address && (
                <div className="text-sm text-slate-500 mt-1">{row.address}</div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {row.status && (
                  <StatusBadge
                    tone={STATUS_TONES[row.status.toUpperCase()] ?? "neutral"}
                  >
                    {row.status}
                  </StatusBadge>
                )}
                {row.claimType && (
                  <span className="text-xs text-slate-400">{row.claimType}</span>
                )}
                {row.totalExTax != null && (
                  <span className="text-xs text-cyan-400">
                    ${row.totalExTax.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => setDetail(row)}>
                  <Eye className="h-4 w-4 mr-1" />
                  Details
                </Button>
                {row.canImport && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importingId === row.id}
                    onClick={() => void importJob(row)}
                  >
                    {importingId === row.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    Import
                  </Button>
                )}
                {row.importedNativeId && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/reports/${row.importedNativeId}`}>
                      Open
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/50">
                <th className="text-left py-4 px-6 font-medium text-slate-400">
                  Title
                </th>
                <th className="text-left py-4 px-6 font-medium text-slate-400">
                  Client
                </th>
                <th className="text-left py-4 px-6 font-medium text-slate-400">
                  Status
                </th>
                <th className="text-left py-4 px-6 font-medium text-slate-400">
                  Address
                </th>
                <th className="text-left py-4 px-6 font-medium text-slate-400">
                  Value
                </th>
                <th className="text-left py-4 px-6 font-medium text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/80">
                  <td className="py-4 px-6 text-white font-medium">
                    {row.title}
                    {row.importedNativeId && (
                      <span className="ml-2 text-xs text-emerald-400">
                        Imported
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-slate-400">
                    {row.clientName || "—"}
                  </td>
                  <td className="py-4 px-6">
                    {row.status ? (
                      <StatusBadge
                        tone={
                          STATUS_TONES[row.status.toUpperCase()] ?? "neutral"
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-4 px-6 text-slate-400 max-w-xs truncate">
                    {row.address || "—"}
                  </td>
                  <td className="py-4 px-6 text-slate-400">
                    {row.totalExTax != null
                      ? `$${row.totalExTax.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`View details for ${row.title}`}
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs"
                        onClick={() => setDetail(row)}
                      >
                        <Eye size={16} />
                      </button>
                      {row.canImport && (
                        <button
                          type="button"
                          aria-label={`Import ${row.title}`}
                          disabled={importingId === row.id}
                          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs disabled:opacity-50"
                          onClick={() => void importJob(row)}
                        >
                          {importingId === row.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Download size={16} />
                          )}
                        </button>
                      )}
                      {row.importedNativeId && (
                        <Link
                          href={`/dashboard/reports/${row.importedNativeId}`}
                          aria-label={`Open imported report ${row.title}`}
                          className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg border border-slate-700 hover:bg-slate-700/50 transition-colors text-xs"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ListPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={setPage}
        noun="jobs"
      />

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              Synced from {detail?.source === "xero" ? "Xero" : "Ascora"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Client</dt>
                <dd>{detail.clientName || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>{detail.status || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Address</dt>
                <dd>{detail.address || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Claim type</dt>
                <dd>{detail.claimType || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Value (ex tax)</dt>
                <dd>
                  {detail.totalExTax != null
                    ? `$${detail.totalExTax.toLocaleString()}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Description</dt>
                <dd className="whitespace-pre-wrap">
                  {detail.description || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">External ID</dt>
                <dd className="font-mono text-xs">{detail.externalId}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
