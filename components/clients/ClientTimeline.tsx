"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TimelineEvent } from "@/lib/crm/client-timeline";

const DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** RA-8220: everything RestoreAssist has done for this client, across jobs. */
export function ClientTimeline({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    setEvents(null);
    setFailed(false);
    fetch(`/api/clients/${encodeURIComponent(clientId)}/timeline`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { events: TimelineEvent[] }) => setEvents(j.events ?? []))
      .catch((e) => {
        if (!ctl.signal.aborted) setFailed(true);
        void e;
      });
    return () => ctl.abort();
  }, [clientId]);

  return (
    <section
      aria-labelledby="client-timeline-heading"
      className="bg-white dark:bg-slate-800/50 border border-brand-mist dark:border-slate-700/50 rounded-xl p-6"
    >
      <h2 id="client-timeline-heading" className="text-lg font-medium mb-4">
        Timeline
      </h2>
      {failed ? (
        <p className="text-sm text-brand-slate dark:text-slate-400">The timeline could not be loaded.</p>
      ) : events === null ? (
        <p className="text-sm text-brand-slate dark:text-slate-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-brand-slate dark:text-slate-400">No jobs for this client yet.</p>
      ) : (
        <ol className="space-y-3 border-l border-brand-mist dark:border-slate-700 pl-4">
          {events.map((e, n) => (
            <li key={`${e.kind}-${e.inspectionId}-${e.at}-${n}`}>
              <time dateTime={e.at} className="block text-xs text-brand-slate dark:text-slate-400">
                {DATE.format(new Date(e.at))}
              </time>
              <Link
                href={`/dashboard/inspections/${encodeURIComponent(e.inspectionId)}`}
                className="text-sm text-brand-navy dark:text-slate-200 hover:underline"
              >
                {e.title}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
