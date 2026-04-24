"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarClock,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { formatCurrencyCents } from "@/lib/formatters";

type RecurringFrequency =
  | "WEEKLY"
  | "FORTNIGHTLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_ANNUALLY"
  | "ANNUALLY";
type RecurringInvoiceStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

interface RecurringInvoice {
  id: string;
  templateName: string;
  description: string | null;
  frequency: RecurringFrequency;
  nextInvoiceDate: string;
  status: RecurringInvoiceStatus;
  totalIncGST: number;
  customerName: string;
  client: {
    id: string;
    name: string;
  } | null;
  _count?: {
    invoices: number;
  };
}

interface RecurringStats {
  active: number;
  paused: number;
  generatedThisMonth: number;
}

// ── Frequency badge ──────────────────────────────────────────────────────────

const FREQUENCY_CONFIG: Record<
  RecurringFrequency,
  { label: string; className: string }
> = {
  WEEKLY: {
    label: "Weekly",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  FORTNIGHTLY: {
    label: "Fortnightly",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  },
  MONTHLY: {
    label: "Monthly",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  QUARTERLY: {
    label: "Quarterly",
    className:
      "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  },
  SEMI_ANNUALLY: {
    label: "Semi-annually",
    className:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  ANNUALLY: {
    label: "Annually",
    className:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
};

function FrequencyBadge({ frequency }: { frequency: RecurringFrequency }) {
  const cfg = FREQUENCY_CONFIG[frequency] ?? {
    label: frequency,
    className: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  RecurringInvoiceStatus,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Active",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  PAUSED: {
    label: "Paused",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  COMPLETED: {
    label: "Completed",
    className:
      "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
};

function StatusBadge({ status }: { status: RecurringInvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Next date cell ────────────────────────────────────────────────────────────

function NextDateCell({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr);
  const now = new Date();
  const isPast = date < now;
  const label = date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <span
      className={
        isPast
          ? "text-red-600 dark:text-red-400 font-medium"
          : "text-green-700 dark:text-green-400"
      }
    >
      {label}
    </span>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Card skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Table row skeletons */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-3">
          <Skeleton className="h-4 w-64" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-6 py-4 border-t border-slate-200 dark:border-slate-700"
          >
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-28 ml-auto" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cancel confirmation ───────────────────────────────────────────────────────

function CancelConfirm({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-slate-600 dark:text-slate-400 mr-1">
        Cancel this schedule?
      </span>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-xs"
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Confirm"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={onCancel}
        disabled={loading}
      >
        No
      </Button>
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecurringInvoicesPage() {
  const [schedules, setSchedules] = useState<RecurringInvoice[]>([]);
  const [stats, setStats] = useState<RecurringStats>({
    active: 0,
    paused: 0,
    generatedThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  // Per-row action state: maps id → 'pausing' | 'resuming' | 'cancelling' | null
  const [actionState, setActionState] = useState<Record<string, string>>({});
  // Which rows have the cancel confirmation open
  const [cancelPending, setCancelPending] = useState<Set<string>>(new Set());

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices/recurring");
      if (!res.ok) throw new Error("Failed to load recurring invoices");
      const data = await res.json();
      const list: RecurringInvoice[] = data.recurringInvoices ?? data ?? [];
      setSchedules(list);

      // Derive stats from list
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStats({
        active: list.filter((s) => s.status === "ACTIVE").length,
        paused: list.filter((s) => s.status === "PAUSED").length,
        generatedThisMonth: list.reduce(
          (acc, s) => acc + (s._count?.invoices ?? 0),
          0,
        ),
      });
    } catch (err) {
      console.error("[RecurringInvoices] fetch error:", err);
      toast.error("Could not load recurring invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const patchStatus = async (
    id: string,
    status: RecurringInvoiceStatus,
    actionKey: string,
  ) => {
    setActionState((prev) => ({ ...prev, [id]: actionKey }));
    try {
      const res = await fetch(`/api/invoices/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s)),
      );
      // Recalculate stats
      setStats((prev) => {
        const updated = schedules.map((s) =>
          s.id === id ? { ...s, status } : s,
        );
        return {
          ...prev,
          active: updated.filter((s) => s.status === "ACTIVE").length,
          paused: updated.filter((s) => s.status === "PAUSED").length,
        };
      });
      const labels: Record<string, string> = {
        pausing: "Schedule paused",
        resuming: "Schedule resumed",
        cancelling: "Schedule cancelled",
      };
      toast.success(labels[actionKey] ?? "Updated");
    } catch {
      toast.error("Failed to update schedule. Please try again.");
    } finally {
      setActionState((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setCancelPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handlePause = (id: string) => patchStatus(id, "PAUSED", "pausing");
  const handleResume = (id: string) => patchStatus(id, "ACTIVE", "resuming");
  const handleCancelConfirm = (id: string) =>
    patchStatus(id, "CANCELLED", "cancelling");

  const openCancelConfirm = (id: string) => {
    setCancelPending((prev) => new Set(prev).add(id));
  };

  const closeCancelConfirm = (id: string) => {
    setCancelPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="max-w-9xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Recurring Invoices
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage automated invoice schedules for your regular clients
          </p>
        </div>
        <Link href="/dashboard/invoices/recurring/new">
          <Button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" />
            Create Recurring Invoice
          </Button>
        </Link>
      </div>

      <Separator />

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-green-500" />
                  Active Schedules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {stats.active}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <PauseCircle className="h-4 w-4 text-amber-500" />
                  Paused
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {stats.paused}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-cyan-500" />
                  Generated This Month
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {stats.generatedThisMonth}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Table or empty state */}
          {schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 py-20 px-6 text-center">
              <CalendarClock className="h-14 w-14 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-600 dark:text-slate-400 text-lg font-medium mb-1">
                No recurring invoices set up yet.
              </p>
              <p className="text-slate-500 dark:text-slate-500 text-sm max-w-md">
                Create a recurring schedule to automatically generate invoices
                on a regular basis.
              </p>
              <Link href="/dashboard/invoices/recurring/new" className="mt-6">
                <Button variant="outline" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create your first schedule
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-700/50">
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">
                      Template / Description
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">
                      Client
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">
                      Frequency
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">
                      Amount (AUD)
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">
                      Next Invoice
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-slate-600 dark:text-slate-300 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => {
                    const isActioning = !!actionState[schedule.id];
                    const showCancelConfirm = cancelPending.has(schedule.id);
                    const currentAction = actionState[schedule.id];

                    return (
                      <TableRow
                        key={schedule.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        {/* Template name / description */}
                        <TableCell>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {schedule.templateName}
                          </div>
                          {schedule.description && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs truncate">
                              {schedule.description}
                            </div>
                          )}
                        </TableCell>

                        {/* Client name */}
                        <TableCell className="text-slate-700 dark:text-slate-300">
                          {schedule.client?.name ?? schedule.customerName}
                        </TableCell>

                        {/* Frequency */}
                        <TableCell>
                          <FrequencyBadge frequency={schedule.frequency} />
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="font-medium text-slate-900 dark:text-white tabular-nums">
                          {formatCurrencyCents(schedule.totalIncGST)}
                        </TableCell>

                        {/* Next invoice date */}
                        <TableCell>
                          <NextDateCell dateStr={schedule.nextInvoiceDate} />
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <StatusBadge status={schedule.status} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {showCancelConfirm ? (
                              <CancelConfirm
                                onConfirm={() =>
                                  handleCancelConfirm(schedule.id)
                                }
                                onCancel={() => closeCancelConfirm(schedule.id)}
                                loading={currentAction === "cancelling"}
                              />
                            ) : (
                              <>
                                {schedule.status === "ACTIVE" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                    onClick={() => handlePause(schedule.id)}
                                    disabled={isActioning}
                                    title="Pause this schedule"
                                  >
                                    {currentAction === "pausing" ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <PauseCircle className="h-3.5 w-3.5 mr-1" />
                                        Pause
                                      </>
                                    )}
                                  </Button>
                                )}

                                {schedule.status === "PAUSED" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    onClick={() => handleResume(schedule.id)}
                                    disabled={isActioning}
                                    title="Resume this schedule"
                                  >
                                    {currentAction === "resuming" ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <PlayCircle className="h-3.5 w-3.5 mr-1" />
                                        Resume
                                      </>
                                    )}
                                  </Button>
                                )}

                                {(schedule.status === "ACTIVE" ||
                                  schedule.status === "PAUSED") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 px-3 text-xs text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    onClick={() =>
                                      openCancelConfirm(schedule.id)
                                    }
                                    disabled={isActioning}
                                    title="Cancel this schedule"
                                  >
                                    <XCircle className="h-3.5 w-3.5 mr-1" />
                                    Cancel
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
