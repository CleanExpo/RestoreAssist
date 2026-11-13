"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { parseApiError } from "@/lib/client/parse-api-error";

interface InboundJob {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  inspectionDate: string;
  claimType: string | null;
  insurer: string | null;
  policyHolder: string | null;
  claimNumber: string | null;
}

/**
 * Dashboard banner for inbound DR/NRPG jobs that haven't been accepted.
 * Mounted on /dashboard. Renders nothing when there are no pending jobs.
 *
 * Action: "Accept & Start" POSTs to /api/inspections/[id]/accept and on
 * success removes the row from the banner. The tradie then taps the
 * inspection number to open the inspection workflow.
 */
export function InboundJobAlert() {
  const [jobs, setJobs] = useState<InboundJob[] | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch("/api/inspections/inbound-jobs", {
        credentials: "include",
      });
      if (!res.ok) {
        const parsed = await parseApiError(res);
        setLoadFailed(true);
        setError(parsed.message || "Could not load inbound jobs");
        setJobs([]);
        return;
      }
      setError(null);
      const data = (await res.json()) as { jobs: InboundJob[] };
      setJobs(data.jobs ?? []);
    } catch {
      setLoadFailed(true);
      setError("Network error — could not load inbound jobs");
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleAccept = useCallback(async (id: string) => {
    setAccepting(id);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${id}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed to accept inspection");
        return;
      }
      // Optimistic remove
      setJobs((prev) => (prev ? prev.filter((j) => j.id !== id) : prev));
    } catch {
      setError("Network error — try again");
    } finally {
      setAccepting(null);
    }
  }, []);

  if (jobs === null) return null; // initial fetch in flight

  if (loadFailed) {
    return (
      <div
        role="alert"
        className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
      >
        <p>{error ?? "Inbound jobs are temporarily unavailable."}</p>
        <button
          type="button"
          onClick={() => {
            setJobs(null);
            void fetchJobs();
          }}
          className="mt-2 text-sm font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div
      data-testid="inbound-job-alert"
      className="border border-brand-bronze/40 bg-brand-bronze/8 dark:bg-brand-bronze/15 rounded-lg p-4 mb-6"
      role="region"
      aria-label="Inbound referral jobs"
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-brand-gold" aria-hidden="true" />
        {/* RA-7660: NRPG is not named to customers until it is ready. */}
        <h2 className="font-semibold text-sm">
          {jobs.length === 1
            ? "1 new job from a referral network"
            : `${jobs.length} new jobs from a referral network`}
        </h2>
      </div>
      {error && (
        <p className="text-xs text-destructive mb-2" role="alert">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex flex-wrap items-center gap-3 p-3 bg-background/50 rounded-md border border-border"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {job.propertyAddress}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {[
                  job.inspectionNumber,
                  job.claimNumber && `Claim ${job.claimNumber}`,
                  job.insurer,
                  job.policyHolder,
                  job.claimType,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => handleAccept(job.id)}
                disabled={accepting === job.id}
                className="bg-brand-navy text-white px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
                aria-label={`Accept and start inspection ${job.inspectionNumber}`}
              >
                {accepting === job.id ? (
                  <>
                    <Loader2
                      className="w-3 h-3 animate-spin"
                      aria-hidden="true"
                    />
                    Accepting…
                  </>
                ) : (
                  <>
                    Accept &amp; Start
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </>
                )}
              </button>
              <Link
                href={`/dashboard/inspections/${job.id}`}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                View
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
