"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CronRun {
  id: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  itemsProcessed: number;
}

interface CronRunsResponse {
  runs: CronRun[];
  total: number;
  failedCount: number;
  limit: number;
}

export default function CronRunsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<CronRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedOnly, setFailedOnly] = useState(false);

  const fetchRuns = useCallback(async (onlyFailed: boolean) => {
    setLoading(true);
    try {
      const query = onlyFailed ? "?status=failed" : "";
      const response = await fetch(`/api/admin/cron-runs${query}`);
      if (response.ok) {
        setData(await response.json());
      }
    } catch (error) {
      console.error("Error fetching cron runs:", error);
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
    fetchRuns(failedOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session, router, failedOnly]);

  const getStatusBadge = (run: CronRun) => {
    if (run.status === "failed") {
      return (
        <Badge className="gap-1 bg-red-500/10 text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    }
    if (run.status === "completed") {
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          Completed
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </Badge>
    );
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="h-12 w-12 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">
          Admin access required
        </p>
      </div>
    );
  }

  const runs = data?.runs ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/admin")}
          className="gap-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Cron Run History
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Read-only observability over recorded cron job runs (CronJobRun)
          </p>
        </div>
        <Badge
          className={cn(
            "gap-1",
            (data?.failedCount ?? 0) > 0
              ? "bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-green-500/10 text-green-600 dark:text-green-400",
          )}
        >
          <AlertCircle className="h-3 w-3" />
          {data?.failedCount ?? 0} failed
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={failedOnly ? "outline" : "default"}
          onClick={() => setFailedOnly(false)}
        >
          All runs
        </Button>
        <Button
          size="sm"
          variant={failedOnly ? "default" : "outline"}
          onClick={() => setFailedOnly(true)}
        >
          Failed only
        </Button>
      </div>

      {/* Runs table */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Clock className="h-5 w-5 text-cyan-500" />
            Recent Runs
          </CardTitle>
          <CardDescription>
            Showing {runs.length} of {data?.total ?? 0} runs, most recent
            first
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No cron runs recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-start justify-between p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-neutral-900 dark:text-white text-sm">
                        {run.jobName}
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">
                        {new Date(run.startedAt).toLocaleString()}
                      </span>
                      {run.durationMs !== null && (
                        <span className="text-xs text-neutral-400 font-mono">
                          {run.durationMs}ms
                        </span>
                      )}
                    </div>
                    {run.errorMessage && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-mono break-all">
                        {run.errorMessage}
                      </p>
                    )}
                    {!run.errorMessage && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {run.itemsProcessed} items processed
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">{getStatusBadge(run)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
