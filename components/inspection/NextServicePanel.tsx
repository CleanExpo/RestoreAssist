"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NextServiceResponse {
  hasCatalogue: boolean;
  services: { id: string; label: string }[];
  businessCardUrl: string | null;
  draft: { subject: string; body: string } | null;
}

/**
 * RA-8220: turns a restoration job into the client's next service. Shows a
 * follow-up draft built from the services the business offers. The technician
 * copies and sends it themselves; nothing is sent from here.
 */
export function NextServicePanel({ inspectionId, className }: { inspectionId: string; className?: string }) {
  const [data, setData] = useState<NextServiceResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/next-service`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: NextServiceResponse) => live && setData(j))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [inspectionId]);

  if (failed || !data) return null;

  const copy = async () => {
    if (!data.draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${data.draft.subject}\n\n${data.draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-labelledby="next-service-heading"
      className={cn(
        "rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 shadow-sm p-4 sm:p-5 space-y-3",
        className,
      )}
    >
      <h2
        id="next-service-heading"
        className="text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-slate-400"
      >
        Next service for this client
      </h2>
      {!data.hasCatalogue ? (
        <p className="text-sm text-neutral-600 dark:text-slate-400">
          Add the services your business offers to suggest this client&apos;s next booking.{" "}
          <Link href="/dashboard/contractors/profile" className="underline">
            Set up your services
          </Link>
        </p>
      ) : !data.draft ? (
        <p className="text-sm text-neutral-600 dark:text-slate-400">
          None of your services is a usual next booking after this type of job.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {data.services.slice(0, 3).map((s) => (
              <li
                key={s.id}
                className="px-2.5 py-1 rounded-full border border-neutral-200 dark:border-slate-700 text-xs text-neutral-700 dark:text-slate-300"
              >
                {s.label}
              </li>
            ))}
          </ul>
          <label htmlFor="next-service-draft" className="sr-only">
            Follow-up draft
          </label>
          <textarea
            id="next-service-draft"
            readOnly
            rows={9}
            value={`Subject: ${data.draft.subject}\n\n${data.draft.body}`}
            className="w-full rounded-lg border border-neutral-200 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800/60 p-3 text-sm text-neutral-800 dark:text-slate-200"
          />
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy draft"}
            </Button>
            <span className="text-xs text-neutral-500 dark:text-slate-400" aria-live="polite">
              Review it, then send it from your own email or phone.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
