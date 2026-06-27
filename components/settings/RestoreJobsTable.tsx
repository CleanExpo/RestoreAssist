"use client";

/**
 * Restore jobs table.
 *
 * Lazy-fetches `/api/storage/restore` on mount, renders the table,
 * and exposes a Retry button on each FAILED row. Retries optimistically
 * flip the status to PENDING.
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";

type Status = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "SKIPPED";

interface RestoreJob {
  id: string;
  status: Status;
  filename: string;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Stats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  lastCompletedAt: string | null;
}

const STATUS_TONE: Record<Status, string> = {
  PENDING: "bg-warning-subtle text-warning-subtle-foreground",
  PROCESSING: "bg-info-subtle text-info-subtle-foreground",
  COMPLETED: "bg-success-subtle text-success-subtle-foreground",
  FAILED: "bg-destructive-subtle text-destructive-subtle-foreground",
  SKIPPED: "bg-muted text-muted-foreground",
};

export function RestoreJobsTable() {
  const [jobs, setJobs] = useState<RestoreJob[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/storage/restore");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        data: { jobs: RestoreJob[]; stats: Stats };
      };
      setJobs(json.data.jobs);
      setStats(json.data.stats);
    } catch (err) {
      toast.error("Could not load restore queue");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onRetry(jobId: string) {
    setRetrying(jobId);
    // Optimistic flip — PENDING straight away.
    setJobs((current) =>
      current.map((j) => (j.id === jobId ? { ...j, status: "PENDING" } : j)),
    );
    try {
      const res = await fetch(`/api/storage/restore/${jobId}/retry`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Retry queued — will run on the next minute tick");
    } catch (err) {
      toast.error("Retry failed");
      console.error(err);
      // Roll back the optimistic flip.
      await refresh();
    } finally {
      setRetrying(null);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading restore queue…</p>
    );
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
          <Stat label="Total" value={stats.total} />
          <Stat label="Pending" value={stats.pending} />
          <Stat label="Processing" value={stats.processing} />
          <Stat label="Completed" value={stats.completed} />
          <Stat label="Failed" value={stats.failed} />
          <Stat label="Skipped" value={stats.skipped} />
        </div>
      )}

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No restore jobs yet. Use the panel above to start a restore.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">File</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Attempts</th>
                <th className="py-2 pr-4">Last error</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="py-2 pr-4 font-medium">{job.filename}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[job.status]}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{job.attempts}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {job.lastError?.slice(0, 80) ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {job.status === "FAILED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retrying === job.id}
                        onClick={() => onRetry(job.id)}
                      >
                        {retrying === job.id ? "Retrying…" : "Retry"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-card p-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
