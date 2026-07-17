"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Mirrors prisma SubscriptionStatus blocked subset (RA-6794).
type BlockedStatus = "PAST_DUE" | "EXPIRED" | "CANCELED";

interface BlockedCustomer {
  id: string;
  name: string | null;
  email: string;
  subscriptionStatus: BlockedStatus | null;
  subscriptionPlan: string | null;
  lastBillingDate: string | null;
  nextBillingDate: string | null;
  subscriptionEndsAt: string | null;
  daysOverdue: number | null;
}

const statusBadgeConfig: Record<
  BlockedStatus,
  { label: string; className: string }
> = {
  PAST_DUE: {
    label: "Past due",
    className:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800",
  },
  EXPIRED: {
    label: "Expired",
    className:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  },
  CANCELED: {
    label: "Canceled",
    className:
      "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
  },
};

function StatusBadge({ status }: { status: BlockedStatus | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-neutral-400">
        Unknown
      </Badge>
    );
  }
  const config = statusBadgeConfig[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function AdminBlockedCustomersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [customers, setCustomers] = useState<BlockedCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/blocked-customers");
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers ?? []);
        setTotal(data.total ?? 0);
        setLoadError(null);
      } else {
        setCustomers([]);
        setTotal(0);
        setLoadError("Failed to load blocked customers");
      }
    } catch (error) {
      console.error("Error fetching blocked customers:", error);
      setCustomers([]);
      setTotal(0);
      setLoadError("Failed to load blocked customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user?.role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchCustomers();
  }, [status, session, router, fetchCustomers]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-neutral-600 dark:text-neutral-400">
          Admin access required
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin")}
          className="gap-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Back to Admin
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              Blocked customers
              {!loading && (
                <Badge className="ml-1 bg-red-500/10 text-red-600 dark:text-red-400">
                  {total}
                </Badge>
              )}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Customers whose subscription has lapsed (past due, expired or
              canceled)
            </p>
          </div>
        </div>
        <Badge className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          Admin Only
        </Badge>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void fetchCustomers()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full bg-red-500"
            />
            Lapsed subscriptions
          </CardTitle>
          <CardDescription>
            {loading
              ? "Loading…"
              : `${total} blocked customer${total !== 1 ? "s" : ""} found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 pb-6">
              <TableSkeleton />
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-500">
              <p className="text-sm">No blocked customers</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-200 dark:border-neutral-800">
                  <TableHead className="pl-6">Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Days overdue
                  </TableHead>
                  <TableHead className="hidden sm:table-cell pr-6">
                    Last charge
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <TableCell className="pl-6 font-medium text-neutral-900 dark:text-white">
                      {customer.email}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={customer.subscriptionStatus} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-neutral-600 dark:text-neutral-400 text-sm">
                      {customer.daysOverdue == null
                        ? "—"
                        : `${customer.daysOverdue} day${customer.daysOverdue !== 1 ? "s" : ""}`}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell pr-6 text-neutral-500 text-sm">
                      {formatDate(customer.lastBillingDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
