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
import {
  DASHBOARD_LIST_PAGE_SIZE,
  ListPagination,
} from "@/components/dashboard/ListPagination";
import { cn } from "@/lib/utils";
import type {
  ExternalDataSource,
  SyncedClientRow,
  SyncedListPagination,
  SyncedListResponse,
} from "@/lib/synced-data/types";

interface SyncedClientsPanelProps {
  source: ExternalDataSource;
  searchTerm: string;
}

export function SyncedClientsPanel({
  source,
  searchTerm,
}: SyncedClientsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [message, setMessage] = useState<string | undefined>();
  const [items, setItems] = useState<SyncedClientRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<SyncedListPagination>({
    page: 1,
    pageSize: DASHBOARD_LIST_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [importingId, setImportingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SyncedClientRow | null>(null);

  // When source/search change, always fetch page 1 (avoid racing page=N
  // from the previous list with the new filters).
  const listKey = `${source}|${searchTerm}`;
  const [activeListKey, setActiveListKey] = useState(listKey);
  const requestPage = listKey === activeListKey ? page : 1;

  useEffect(() => {
    if (listKey !== activeListKey) {
      setActiveListKey(listKey);
      setPage(1);
    }
  }, [listKey, activeListKey]);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        source,
        page: String(requestPage),
        pageSize: String(DASHBOARD_LIST_PAGE_SIZE),
      });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());

      const res = await fetch(`/api/synced/clients?${params.toString()}`);
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
        setError(body.error || body.message || "Failed to load synced clients");
        return;
      }

      const data = (await res.json()) as SyncedListResponse<SyncedClientRow>;
      setItems(data.items);
      setConnected(data.connected);
      setMessage(data.message);
      setPagination(data.pagination);
      if (
        data.pagination.totalPages > 0 &&
        requestPage > data.pagination.totalPages
      ) {
        setPage(data.pagination.totalPages);
      }
    } catch {
      setItems([]);
      setError("Failed to load synced clients");
    } finally {
      setLoading(false);
    }
  }, [source, searchTerm, requestPage]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const importClient = async (row: SyncedClientRow) => {
    if (!row.canImport || row.source !== "xero") return;
    try {
      setImportingId(row.id);
      const res = await fetch("/api/integrations/oauth/xero/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientIds: [row.externalId] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || body.message || "Import failed");
        return;
      }
      toast.success(body.message || "Client imported");
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
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => void fetchItems()}>
          Retry
        </button>
      </div>
    );
  }

  if (!connected || (items.length === 0 && pagination.total === 0)) {
    return (
      <div
        className={cn(
          "rounded-lg border overflow-hidden",
          "border-neutral-200 dark:border-slate-700/50",
          "bg-white dark:bg-slate-800/30",
        )}
      >
        <EmptyState
          icon={<Plug className="h-10 w-10" aria-hidden />}
          title={
            !connected
              ? `No ${source === "xero" ? "Xero" : "Ascora"} connection`
              : searchTerm
                ? "No matching synced clients"
                : `No ${source === "xero" ? "Xero" : "Ascora"} clients synced yet`
          }
          description={
            message ||
            (!connected
              ? "Sync from Integrations first to browse contacts here."
              : searchTerm
                ? undefined
                : "Sync from Integrations first to see contacts here.")
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
      <div
        className={cn(
          "rounded-lg border overflow-hidden",
          "border-neutral-200 dark:border-slate-700/50",
          "bg-white dark:bg-slate-800/30",
        )}
      >
        <div className="sm:hidden space-y-3 p-4">
          {items.map((row) => (
            <div
              key={row.id}
              className={cn(
                "rounded-xl border p-4",
                "border-neutral-200 dark:border-slate-700/50",
                "bg-white dark:bg-slate-900/50",
              )}
            >
              <div className="font-medium text-neutral-900 dark:text-white">
                {row.name}
              </div>
              {row.email && (
                <div className="text-sm text-neutral-600 dark:text-slate-400">
                  {row.email}
                </div>
              )}
              {row.phone && (
                <div className="text-sm text-neutral-600 dark:text-slate-400">
                  {row.phone}
                </div>
              )}
              {row.address && (
                <div className="text-sm text-neutral-500 dark:text-slate-500 mt-1">
                  {row.address}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDetail(row)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Details
                </Button>
                {row.canImport && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={importingId === row.id}
                    onClick={() => void importClient(row)}
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
                    <Link href={`/dashboard/clients/${row.importedNativeId}`}>
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
              <tr
                className={cn(
                  "border-b",
                  "border-neutral-200 dark:border-slate-700",
                  "bg-neutral-50 dark:bg-slate-900/50",
                )}
              >
                <th className="text-left py-4 px-6 font-medium text-neutral-700 dark:text-slate-400">
                  Name
                </th>
                <th className="text-left py-4 px-6 font-medium text-neutral-700 dark:text-slate-400">
                  Email
                </th>
                <th className="text-left py-4 px-6 font-medium text-neutral-700 dark:text-slate-400">
                  Phone
                </th>
                <th className="text-left py-4 px-6 font-medium text-neutral-700 dark:text-slate-400">
                  Address
                </th>
                <th className="text-left py-4 px-6 font-medium text-neutral-700 dark:text-slate-400">
                  Jobs
                </th>
                <th className="text-left py-4 px-6 font-medium text-neutral-700 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-neutral-100 dark:border-slate-800/80"
                >
                  <td className="py-4 px-6 text-neutral-900 dark:text-white font-medium">
                    {row.name}
                    {row.importedNativeId && (
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                        Imported
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-slate-400">
                    {row.email || "—"}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-slate-400">
                    {row.phone || "—"}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-slate-400 max-w-xs truncate">
                    {row.address || "—"}
                  </td>
                  <td className="py-4 px-6 text-neutral-600 dark:text-slate-400">
                    {row.jobCount ?? "—"}
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`View details for ${row.name}`}
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-neutral-300 dark:border-slate-700 hover:bg-neutral-100 dark:hover:bg-slate-700/50 transition-colors text-xs"
                        onClick={() => setDetail(row)}
                      >
                        <Eye size={16} />
                      </button>
                      {row.canImport && (
                        <button
                          type="button"
                          aria-label={`Import ${row.name}`}
                          disabled={importingId === row.id}
                          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-lg border border-neutral-300 dark:border-slate-700 hover:bg-neutral-100 dark:hover:bg-slate-700/50 transition-colors text-xs disabled:opacity-50"
                          onClick={() => void importClient(row)}
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
                          href={`/dashboard/clients/${row.importedNativeId}`}
                          aria-label={`Open imported client ${row.name}`}
                          className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg border border-neutral-300 dark:border-slate-700 hover:bg-neutral-100 dark:hover:bg-slate-700/50 transition-colors text-xs"
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
        noun="clients"
      />

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              Synced from {detail?.source === "xero" ? "Xero" : "Ascora"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-neutral-500 dark:text-slate-500">Email</dt>
                <dd>{detail.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-slate-500">Phone</dt>
                <dd>{detail.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-slate-500">Address</dt>
                <dd>{detail.address || "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-slate-500">
                  External ID
                </dt>
                <dd className="font-mono text-xs">{detail.externalId}</dd>
              </div>
              {detail.jobCount != null && (
                <div>
                  <dt className="text-neutral-500 dark:text-slate-500">
                    Linked jobs
                  </dt>
                  <dd>{detail.jobCount}</dd>
                </div>
              )}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
