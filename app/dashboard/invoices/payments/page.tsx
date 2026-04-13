"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  DollarSign,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Payment {
  id: string;
  paymentDate: string;
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  paymentMethod: string;
  reference: string | null;
  amount: number; // cents from API, or dollars from mock
  reconciled: boolean;
  reconciledAt: string | null;
  externalProvider: string | null;
}

// ---------------------------------------------------------------------------
// Mock data (used when the API is unavailable / returns an error)
// ---------------------------------------------------------------------------

const MOCK_PAYMENTS: Payment[] = [
  {
    id: "1",
    paymentDate: "2026-03-28",
    invoiceId: "inv-1",
    invoiceNumber: "INV-1042",
    clientName: "Smith Restoration Pty Ltd",
    paymentMethod: "BANK_TRANSFER",
    reference: "BSB 063-000 / Acc 12345678",
    amount: 4850.0,
    reconciled: true,
    reconciledAt: "2026-03-29",
    externalProvider: "Xero",
  },
  {
    id: "2",
    paymentDate: "2026-03-27",
    invoiceId: "inv-2",
    invoiceNumber: "INV-1041",
    clientName: "Brisbane Water Damage Co",
    paymentMethod: "STRIPE",
    reference: "pi_3OxK4t2eZvKYlo2C",
    amount: 1200.0,
    reconciled: false,
    reconciledAt: null,
    externalProvider: "Stripe",
  },
  {
    id: "3",
    paymentDate: "2026-03-25",
    invoiceId: "inv-3",
    invoiceNumber: "INV-1038",
    clientName: "Melbourne Mould Remediation",
    paymentMethod: "CHEQUE",
    reference: "CHQ #004421",
    amount: 7200.0,
    reconciled: true,
    reconciledAt: "2026-03-26",
    externalProvider: null,
  },
  {
    id: "4",
    paymentDate: "2026-03-22",
    invoiceId: "inv-4",
    invoiceNumber: "INV-1035",
    clientName: "Perth Fire & Flood Services",
    paymentMethod: "BANK_TRANSFER",
    reference: "EFT 20260322",
    amount: 3150.5,
    reconciled: false,
    reconciledAt: null,
    externalProvider: null,
  },
  {
    id: "5",
    paymentDate: "2026-03-20",
    invoiceId: "inv-5",
    invoiceNumber: "INV-1031",
    clientName: "Adelaide Restoration Group",
    paymentMethod: "CASH",
    reference: "Cash receipt #89",
    amount: 550.0,
    reconciled: true,
    reconciledAt: "2026-03-20",
    externalProvider: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  STRIPE: "Stripe",
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  PAYPAL: "PayPal",
  EXTERNAL: "External",
  OTHER: "Other",
  // Legacy/mock value
  EFT: "EFT",
};

const METHOD_COLOURS: Record<string, string> = {
  BANK_TRANSFER: "bg-blue-100 text-blue-800",
  CHEQUE: "bg-amber-100 text-amber-800",
  STRIPE: "bg-purple-100 text-purple-800",
  CASH: "bg-green-100 text-green-800",
  CREDIT_CARD: "bg-rose-100 text-rose-800",
  PAYPAL: "bg-sky-100 text-sky-800",
  EXTERNAL: "bg-gray-100 text-gray-800",
  EFT: "bg-teal-100 text-teal-800",
  OTHER: "bg-gray-100 text-gray-800",
};

function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

function methodColour(method: string): string {
  return METHOD_COLOURS[method] ?? "bg-gray-100 text-gray-800";
}

/** Normalise an amount from the API (cents) or mock (dollars) to dollars */
function normaliseCents(amount: number, isMock: boolean): number {
  // API stores amounts in cents (integers). Mock data uses dollars.
  // A heuristic: if it looks like cents (> realistic dollar amount), divide.
  // But since mock can't be distinguished by field alone, we use the flag.
  if (!isMock && amount > 1000) return amount / 100;
  return amount;
}

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentRegisterPage() {
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);

  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [reconciledFilter, setReconciledFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (methodFilter !== "ALL") params.set("method", methodFilter);
      if (reconciledFilter !== "ALL")
        params.set(
          "reconciled",
          reconciledFilter === "RECONCILED" ? "true" : "false",
        );

      const res = await fetch(`/api/invoices/payments?${params}`);
      if (!res.ok) throw new Error("API unavailable");
      const data = await res.json();

      // Normalise API shape → our Payment interface
      const normalised: Payment[] = (data.payments ?? []).map((p: any) => ({
        id: p.id,
        paymentDate: p.paymentDate ? p.paymentDate.substring(0, 10) : "",
        invoiceId: p.invoice?.id ?? p.invoiceId ?? "",
        invoiceNumber: p.invoice?.invoiceNumber ?? "",
        clientName: p.invoice?.client?.name ?? "",
        paymentMethod: p.paymentMethod,
        reference: p.reference ?? null,
        amount: normaliseCents(p.amount, false),
        reconciled: p.reconciled,
        reconciledAt: p.reconciledAt ? p.reconciledAt.substring(0, 10) : null,
        externalProvider: p.externalProvider ?? null,
      }));

      setAllPayments(normalised);
      setIsMock(false);
    } catch {
      setAllPayments(MOCK_PAYMENTS);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, methodFilter, reconciledFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Reset to page 1 when filters/search change
  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, methodFilter, reconciledFilter, search]);

  // ---------------------------------------------------------------------------
  // Filtered + paginated data
  // ---------------------------------------------------------------------------

  const filtered = allPayments.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.invoiceNumber.toLowerCase().includes(q) &&
        !p.clientName.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---------------------------------------------------------------------------
  // Stats (computed from unfiltered allPayments, scoped to current month)
  // ---------------------------------------------------------------------------

  const now = new Date();
  const mtdPayments = allPayments.filter((p) => {
    if (!p.paymentDate) return false;
    const d = new Date(p.paymentDate);
    return (
      d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    );
  });

  const totalReceivedMTD = mtdPayments.reduce((sum, p) => sum + p.amount, 0);
  const unreconciledCount = allPayments.filter((p) => !p.reconciled).length;
  const mtdCount = mtdPayments.length;

  // Average days to pay (using reconciledAt as a proxy for "paid date" — or paymentDate itself)
  // We use paymentDate directly since we don't have dueDate on the payment record here
  const avgDaysToPay = (() => {
    const withDates = allPayments.filter(
      (p) => p.paymentDate && p.reconciledAt,
    );
    if (withDates.length === 0) return 0;
    const total = withDates.reduce((sum, p) => {
      const diff =
        new Date(p.reconciledAt!).getTime() - new Date(p.paymentDate).getTime();
      return sum + Math.max(0, Math.round(diff / 86400000));
    }, 0);
    return Math.round(total / withDates.length);
  })();

  // ---------------------------------------------------------------------------
  // Reconciliation toggle
  // ---------------------------------------------------------------------------

  const handleReconcileToggle = async (paymentId: string, current: boolean) => {
    const newValue = !current;

    // Optimistic update
    setAllPayments((prev) =>
      prev.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              reconciled: newValue,
              reconciledAt: newValue
                ? new Date().toISOString().substring(0, 10)
                : null,
            }
          : p,
      ),
    );

    try {
      const res = await fetch(`/api/invoices/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paymentId, reconciled: newValue }),
      });
      if (!res.ok) throw new Error("PATCH failed");
    } catch {
      // Revert optimistic update
      setAllPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? {
                ...p,
                reconciled: current,
                reconciledAt: current ? (p.reconciledAt ?? null) : null,
              }
            : p,
        ),
      );
      alert("Failed to update reconciliation status. Please try again.");
    }
  };

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------

  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Invoice #",
      "Client",
      "Method",
      "Reference",
      "Amount",
      "Reconciled",
      "Source",
    ];
    const rows = filtered.map((p) => [
      formatDate(p.paymentDate),
      p.invoiceNumber,
      p.clientName,
      methodLabel(p.paymentMethod),
      p.reference ?? "",
      p.amount.toFixed(2),
      p.reconciled ? "Yes" : "No",
      p.externalProvider ?? "Manual",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payment-register-${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link
              href="/dashboard/invoices"
              className="hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Invoices
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">
              Payment Register
            </span>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight">
            Payment Register
          </h1>
          {isMock && (
            <p className="text-xs text-amber-600 mt-0.5">
              Showing sample data — could not reach API
            </p>
          )}
        </div>
        <Button onClick={handleExportCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Received (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(totalReceivedMTD)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Unreconciled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{unreconciledCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Avg Days to Pay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgDaysToPay}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              This Month's Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{mtdCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">
                From
              </label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-36"
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">
                To
              </label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-36"
              />
            </div>

            {/* Payment method */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">
                Method
              </label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">All Methods</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="STRIPE">Stripe</option>
                <option value="CASH">Cash</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="PAYPAL">PayPal</option>
                <option value="EXTERNAL">External</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Reconciled toggle */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">
                Reconciled
              </label>
              <select
                value={reconciledFilter}
                onChange={(e) => setReconciledFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ALL">All</option>
                <option value="RECONCILED">Reconciled</option>
                <option value="UNRECONCILED">Unreconciled</option>
              </select>
            </div>

            {/* Search */}
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <label className="text-xs text-muted-foreground font-medium">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Invoice # or client name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Clear filters */}
            {(fromDate ||
              toDate ||
              methodFilter !== "ALL" ||
              reconciledFilter !== "ALL" ||
              search) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setMethodFilter("ALL");
                  setReconciledFilter("ALL");
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Client
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Method
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Reference
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  Reconciled
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Skeleton className="h-4 w-4 mx-auto rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <DollarSign className="h-10 w-10 opacity-30" />
                      <p className="font-medium">No payments recorded yet</p>
                      <Link
                        href="/dashboard/invoices"
                        className="text-sm text-primary hover:underline"
                      >
                        Go to Invoices
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(payment.paymentDate)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {payment.invoiceId ? (
                        <Link
                          href={`/dashboard/invoices/${payment.invoiceId}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {payment.invoiceNumber || payment.invoiceId}
                        </Link>
                      ) : (
                        <span className="font-mono text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {payment.clientName || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${methodColour(payment.paymentMethod)}`}
                      >
                        {methodLabel(payment.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                      {payment.reference || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Checkbox
                        checked={payment.reconciled}
                        onCheckedChange={() =>
                          handleReconcileToggle(payment.id, payment.reconciled)
                        }
                        aria-label={`Mark payment ${payment.invoiceNumber} as ${payment.reconciled ? "unreconciled" : "reconciled"}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {payment.externalProvider || "Manual"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}{" "}
              payments
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
