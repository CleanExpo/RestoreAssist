"use client";

/**
 * ClientEvidenceReviewPanel (client portal Phase 2b-iii).
 *
 * Staff control on the inspection page: see the photos/notes a client sent
 * through their portal link that are still in quarantine, then accept them all
 * into the report's chain-of-custody in one click.
 *
 * Thin wrapper over the authed routes:
 *   GET  /api/inspections/[id]/evidence/client-submissions  (list + signed URLs)
 *   POST /api/inspections/[id]/evidence/promote-client      (accept all)
 *
 * Self-hides when there is nothing awaiting review.
 */

import { useCallback, useEffect, useId, useState } from "react";

interface Submission {
  id: string;
  description: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  submittedAt: string;
  viewUrl: string | null;
}

// RA-8388 (founder ruling 16/11/2026): photos a client sends through the
// portal are evidence, but they are not signed captures by the technician, so
// they stay out of the count of required photos at submit. Say so on screen.
const NOT_COUNTED_NOTE =
  "Client photos do not count toward the photos your technician must capture before the job can be submitted.";

export function ClientEvidenceReviewPanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // RA-8388: ties the not-counted note to the accept button, so assistive
  // technology reads it out before the button is pressed.
  const noteId = useId();

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/evidence/client-submissions`,
      );
      if (!res.ok) return;
      const body = await res.json();
      setSubmissions(body.data?.submissions ?? []);
    } catch {
      setSubmissions([]);
    }
  }, [inspectionId]);

  useEffect(() => {
    load();
  }, [load]);

  const [accepted, setAccepted] = useState(false);

  async function acceptAll() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/inspections/${inspectionId}/evidence/promote-client`,
        { method: "POST" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error();
      setSubmissions([]);
      setMessage(`Added ${body.data.promoted} item(s) to the report.`);
      // The not-counted note is about photos that were added. When nothing
      // was (another staff member accepted first), it would say so of nothing.
      setAccepted(Number(body.data.promoted) > 0);
    } catch {
      setMessage("Couldn’t add those to the report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submissions === null) return null; // not loaded yet
  const pending = submissions.length > 0;
  // Nothing to review and nothing to confirm: hide entirely.
  if (!pending && !message) return null;

  // RA-8388: ONE status region, mounted from the moment there is something
  // to review and kept in the same place when the review list goes away. The
  // confirmation is written INTO it. A region that is inserted with its text
  // already inside is often not announced by a screen reader.
  // One wrapper, so the page's spacing sees one child as it always has; the
  // empty region inside it takes no room.
  return (
    <div>
    {pending && (
    <section className="bg-white rounded-2xl shadow-sm border border-amber-200 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Client photos awaiting your review
          <span className="ml-2 text-xs font-normal text-amber-600">
            ({submissions.length})
          </span>
        </h2>
        <p className="text-xs text-slate-500">
          Your client sent these through their portal link. Review them, then
          add them to the report’s evidence record.
        </p>
        <p id={noteId} className="text-xs text-slate-500 mt-1">{NOT_COUNTED_NOTE}</p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {submissions.map((s) => (
          <li key={s.id} className="rounded-lg border border-slate-200 p-2">
            {s.viewUrl ? (
              <a
                href={s.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View client photo ${s.fileName ?? ""}`}
                className="block"
              >
                <img
                  src={s.viewUrl}
                  alt={s.description ?? s.fileName ?? "Client photo"}
                  className="w-full h-24 object-cover rounded"
                />
              </a>
            ) : (
              <div className="w-full h-24 rounded bg-slate-50 flex items-center justify-center text-center text-xs text-slate-500 p-2">
                {s.description ?? "Note"}
              </div>
            )}
            {s.viewUrl && s.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {s.description}
              </p>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={acceptAll}
        disabled={busy}
        aria-label="Add all client photos to the report"
        aria-describedby={noteId}
        className="min-h-11 px-4 rounded-lg bg-brand-harbour-600 text-white text-sm font-medium hover:bg-brand-harbour-700 disabled:opacity-40"
      >
        {busy ? "Adding…" : "Add all to report"}
      </button>

      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </section>
    )}
    <p role="status" className="text-xs text-success">
      {!pending && message}
      {!pending && accepted && (
        <span className="block text-slate-500">{NOT_COUNTED_NOTE}</span>
      )}
    </p>
    </div>
  );
}
