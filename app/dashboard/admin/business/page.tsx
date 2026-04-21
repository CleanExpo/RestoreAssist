"use client";

/**
 * RA-1357 — Business observability dashboard (admin only).
 *
 * Surfaces: MRR, paying customers, new trials, trial→paid conversion,
 * churn, failed charges 30d, subscription deletions 30d. Refreshes
 * manually on button click — aggregates are fast but not live.
 */

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, RefreshCcw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Metrics {
  generatedAt: string;
  currency: string;
  mrr: number;
  payingCustomers: number;
  planUnmatched: number;
  newTrialsThisMonth: number;
  convertedThisMonth: number;
  churnedThisMonth: number;
  failedCharges30d: number;
  subscriptionsDeleted30d: number;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);
}

export default function BusinessMetricsPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/business-metrics");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as Metrics;
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-destructive">Unable to load metrics: {error}</p>
        <Button onClick={() => fetchMetrics()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const convRate =
    data.newTrialsThisMonth > 0
      ? Math.round((data.convertedThisMonth / data.newTrialsThisMonth) * 100)
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Business metrics</h1>
          <p className="text-sm text-muted-foreground">
            MRR, conversion, churn, failed charges. Refreshed on load — hit refresh for current values.
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchMetrics(true)} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>MRR (estimated)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatCurrency(data.mrr, data.currency)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {data.payingCustomers} paying{" "}
            {data.planUnmatched > 0 && (
              <span className="text-amber-600">
                — {data.planUnmatched} unmatched plan(s)
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>New trials (this month)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.newTrialsThisMonth}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {data.convertedThisMonth} converted{" "}
            {convRate !== null && <>· {convRate}% rate</>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Churned (this month)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{data.churnedThisMonth}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            CANCELED or EXPIRED with end date this month
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed charges (30d)</CardDescription>
            <CardTitle
              className={`text-3xl tabular-nums ${
                data.failedCharges30d > 5 ? "text-destructive" : ""
              }`}
            >
              {data.failedCharges30d === -1 ? "—" : data.failedCharges30d}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Stripe <code>invoice.payment_failed</code>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Subscription deletions (30d)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {data.subscriptionsDeleted30d === -1 ? "—" : data.subscriptionsDeleted30d}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Stripe <code>customer.subscription.deleted</code>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Data freshness</CardDescription>
            <CardTitle className="text-base font-normal text-muted-foreground">
              {new Date(data.generatedAt).toLocaleString("en-AU")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Not real-time. Click Refresh for current numbers.
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-dashed border-muted p-4 text-xs text-muted-foreground">
        <p className="font-medium">Not yet tracked here:</p>
        <ul className="mt-1 ml-4 list-disc space-y-0.5">
          <li>AI spend per-org (needs per-request token logging)</li>
          <li>Activation / engagement cohorts</li>
          <li>Revenue by plan / cohort</li>
          <li>Alert rules — wire via Vercel Observability alerts (RA-1349)</li>
        </ul>
      </div>
    </div>
  );
}
