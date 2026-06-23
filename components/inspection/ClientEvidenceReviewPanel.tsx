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

import { useCallback, useEffect, useState } from "react";

interface Submission {
  id: string;
  description: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  submittedAt: string;
  viewUrl: string | null;
}

export function ClientEvidenceReviewPanel({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    } catch {
      setMessage("Couldn’t add those to the report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submissions === null) return null; // not loaded yet
  if (submissions.length === 0) {
    // Show a brief confirmation after a successful accept, else hide entirely.
    return message ? (
      <p role="status" className="text-xs text-success">
        {message}
      </p>
    ) : null;
  }

  return (
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
        className="min-h-11 px-4 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
      >
        {busy ? "Adding…" : "Add all to report"}
      </button>

      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </section>
  );
}
