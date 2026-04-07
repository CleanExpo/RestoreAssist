"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsStats {
  totalRevenue: number;
  outstanding: number;
  overdue: number;
  paidThisMonth: number;
  draftTotal: number;
}

interface MonthlyRevenueRow {
  month: string; // "YYYY-MM"
  revenue: number;
  count: number;
}

interface AnalyticsData {
  stats: AnalyticsStats;
  monthlyRevenue: MonthlyRevenueRow[];
}

interface InvoiceForComputed {
  id: string;
  customerName: string;
  status: string;
  totalIncGST: number;
  amountDue: number;
  amountPaid: number;
  dueDate: string;
}

interface AgingBucket {
  label: string;
  count: number;
  amount: number;
}

interface TopClient {
  name: string;
  totalInvoiced: number;
  invoiceCount: number;
  outstanding: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OVERDUE_STATUSES = new Set([
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "OVERDUE",
]);

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function monthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function computeAgingBuckets(invoices: InvoiceForComputed[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: "< 30 days", count: 0, amount: 0 },
    { label: "30–60 days", count: 0, amount: 0 },
    { label: "61–90 days", count: 0, amount: 0 },
    { label: "90+ days", count: 0, amount: 0 },
  ];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const inv of invoices) {
    if (!OVERDUE_STATUSES.has(inv.status)) continue;
    if (inv.amountDue <= 0) continue;
    const due = new Date(inv.dueDate);
    due.setHours(0, 0, 0, 0);
    if (due >= today) continue; // not yet overdue

    const diffDays = Math.floor((today.getTime() - due.getTime()) / 86_400_000);

    if (diffDays < 30) {
      buckets[0].count++;
      buckets[0].amount += inv.amountDue;
    } else if (diffDays < 60) {
      buckets[1].count++;
      buckets[1].amount += inv.amountDue;
    } else if (diffDays < 90) {
      buckets[2].count++;
      buckets[2].amount += inv.amountDue;
    } else {
      buckets[3].count++;
      buckets[3].amount += inv.amountDue;
    }
  }

  return buckets;
}

function computeTopClients(invoices: InvoiceForComputed[]): TopClient[] {
  const map = new Map<string, TopClient>();

  for (const inv of invoices) {
    if (!map.has(inv.customerName)) {
      map.set(inv.customerName, {
        name: inv.customerName,
        totalInvoiced: 0,
        invoiceCount: 0,
        outstanding: 0,
      });
    }
    const client = map.get(inv.customerName)!;
    client.totalInvoiced += inv.totalIncGST;
    client.invoiceCount++;
    if (OVERDUE_STATUSES.has(inv.status) && inv.amountDue > 0) {
      client.outstanding += inv.amountDue;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalInvoiced - a.totalInvoiced)
    .slice(0, 5);
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function SummaryCardSkeleton() {
  return (
    <Card className="py-5">
      <CardContent className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InvoiceAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceForComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [analyticsRes, invoicesRes] = await Promise.all([
          fetch("/api/invoices/analytics"),
          fetch("/api/invoices?limit=500"),
        ]);

        if (!analyticsRes.ok) throw new Error("Failed to load analytics");
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);

        if (invoicesRes.ok) {
          const invoicesData = await invoicesRes.json();
          setInvoices(invoicesData.invoices ?? []);
        }
      } catch (err: any) {
        setError(err.message ?? "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Derived data from invoices list
  const agingBuckets = computeAgingBuckets(invoices);
  const topClients = computeTopClients(invoices);

  // Last 6 months from the monthly revenue data
  const last6Months = (analytics?.monthlyRevenue ?? []).slice(0, 6).reverse();
  const maxMonthRevenue = Math.max(...last6Months.map((r) => r.revenue), 1);

  const hasData =
    (analytics?.stats.totalRevenue ?? 0) > 0 || invoices.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-cyan-500 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <BarChart3 className="h-6 w-6 text-cyan-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Invoice Analytics
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Revenue trends, overdue aging and client breakdown
            </p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Section 1: Summary cards ── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          Summary
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SummaryCardSkeleton key={i} />
            ))}
          </div>
        ) : !hasData ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No invoice data yet</p>
            <p className="text-sm mt-1">
              Create and send invoices to see analytics here.
            </p>
            <Link
              href="/dashboard/invoices/new"
              className="inline-block mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors"
            >
              Create Invoice
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Revenue */}
            <Card className="py-5">
              <CardContent className="flex items-center gap-4">
                <div className="p-3 bg-green-500/10 rounded-lg flex-shrink-0">
                  <DollarSign className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {fmt(analytics?.stats.totalRevenue ?? 0)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Total Revenue
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding */}
            <Card className="py-5">
              <CardContent className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-lg flex-shrink-0">
                  <Clock className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {fmt(analytics?.stats.outstanding ?? 0)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Outstanding
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Overdue */}
            <Card className="py-5">
              <CardContent className="flex items-center gap-4">
                <div className="p-3 bg-red-500/10 rounded-lg flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {fmt(analytics?.stats.overdue ?? 0)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Overdue
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Paid This Month */}
            <Card className="py-5">
              <CardContent className="flex items-center gap-4">
                <div className="p-3 bg-cyan-500/10 rounded-lg flex-shrink-0">
                  <CheckCircle className="h-6 w-6 text-cyan-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {fmt(analytics?.stats.paidThisMonth ?? 0)}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Paid This Month
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* ── Section 2: Revenue by Month ── */}
      {!loading && hasData && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Month</CardTitle>
            </CardHeader>
            <CardContent>
              {last6Months.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-4">
                  No monthly data available.
                </p>
              ) : (
                <div className="space-y-3">
                  {last6Months.map((row) => {
                    const pct = Math.round(
                      (row.revenue / maxMonthRevenue) * 100,
                    );
                    return (
                      <div key={row.month} className="flex items-center gap-3">
                        {/* Month label */}
                        <div className="w-14 text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 text-right">
                          {monthLabel(row.month)}
                        </div>
                        {/* Bar track */}
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-6 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500 flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          >
                            {pct >= 20 && (
                              <span className="text-xs font-semibold text-white">
                                {fmt(row.revenue)}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Amount label outside bar (for narrow bars) */}
                        <div className="w-24 text-xs font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0">
                          {pct < 20 ? fmt(row.revenue) : ""}
                          <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">
                            ({row.count} inv)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Section 3: Overdue Aging ── */}
      {!loading && hasData && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Overdue Aging</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {agingBuckets.map((bucket) => (
                  <div
                    key={bucket.label}
                    className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                      {bucket.label}
                    </div>
                    <div className="text-xl font-bold text-slate-900 dark:text-white">
                      {fmt(bucket.amount)}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {bucket.count === 0
                        ? "No invoices"
                        : bucket.count === 1
                          ? "1 invoice"
                          : `${bucket.count} invoices`}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Section 4: Top Clients by Invoice Value ── */}
      {!loading && hasData && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Top Clients by Invoice Value</CardTitle>
            </CardHeader>
            <CardContent>
              {topClients.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-4">
                  No client data available.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {topClients.map((client, idx) => (
                    <div
                      key={client.name}
                      className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      {/* Rank badge */}
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Client name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {client.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {client.invoiceCount === 1
                            ? "1 invoice"
                            : `${client.invoiceCount} invoices`}
                        </p>
                      </div>

                      {/* Total invoiced */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {fmt(client.totalInvoiced)}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          invoiced
                        </p>
                      </div>

                      {/* Outstanding badge */}
                      {client.outstanding > 0 ? (
                        <Badge
                          variant="destructive"
                          className="flex-shrink-0 text-xs"
                        >
                          {fmt(client.outstanding)} outstanding
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="flex-shrink-0 text-xs text-green-600 dark:text-green-400"
                        >
                          Paid up
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Loading skeletons for lower sections */}
      {loading && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-12 flex-shrink-0" />
                  <Skeleton className="h-6 flex-1 rounded-full" />
                  <Skeleton className="h-4 w-20 flex-shrink-0" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
