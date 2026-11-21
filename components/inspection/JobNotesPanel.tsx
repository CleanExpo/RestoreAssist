"use client";

/**
 * RA-8496 — append-only, time-stamped job notes on the job page.
 *
 * Newest first. Each note shows who wrote it, their role and the exact date
 * and time. There is no edit or delete control on purpose: a correction is a
 * new note.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChromeChat, ChromeSpinner } from "@/components/brand/chrome-icons";
import {
  JOB_NOTE_KINDS,
  JOB_NOTE_KIND_LABELS,
  JOB_NOTE_MAX_LENGTH,
  formatJobNoteTime,
  jobNoteRoleLabel,
  type JobNoteKindValue,
} from "@/lib/job-notes";

export type JobNoteRow = {
  id: string;
  kind: string;
  body: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
};

function kindLabel(kind: string): string {
  return JOB_NOTE_KIND_LABELS[kind as JobNoteKindValue] ?? kind;
}

async function errorBody(
  res: Response,
): Promise<{ code?: string; message?: string }> {
  const json = await res.json().catch(() => null);
  const error = json?.error;
  return {
    code: typeof error?.code === "string" ? error.code : undefined,
    message:
      typeof error?.message === "string" && error.message
        ? error.message
        : undefined,
  };
}

/** One id per draft, so a save retried after a lost response is recognised. */
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function JobNotesPanel({ inspectionId }: { inspectionId: string }) {
  const [notes, setNotes] = useState<JobNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<JobNoteKindValue>("GENERAL");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const draftId = useRef<string>(newRequestId());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/notes`);
      if (!res.ok) {
        const err = await errorBody(res);
        // Only the route's own "not migrated yet" answer means the feature is
        // missing; any other 503 (an outage) says what went wrong.
        throw new Error(
          err.code === "FEATURE_UNAVAILABLE"
            ? "Job notes are not available yet."
            : (err.message ?? "Could not load the notes."),
        );
      }
      const json = await res.json();
      setNotes(Array.isArray(json.data) ? json.data : []);
      setTruncated(json?.meta?.truncated === true);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Could not load the notes.",
      );
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    // If the answer never arrives, the note may still have been saved. Then
    // the list is reloaded so it shows, and the draft keeps its id, so
    // pressing Add note again returns that note rather than a second copy.
    let unsure = false;
    try {
      let res: Response;
      try {
        res = await fetch(`/api/inspections/${inspectionId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            body,
            clientRequestId: draftId.current,
          }),
        });
      } catch {
        unsure = true;
        throw new Error(
          "Could not reach the server. Check the list, then try again.",
        );
      }
      if (!res.ok) {
        unsure = res.status >= 500;
        throw new Error(
          (await errorBody(res)).message ?? "Could not save the note.",
        );
      }
      const json = await res.json();
      const saved = json.data as JobNoteRow;
      // The server's copy, with the server's stamp, goes on top (once).
      setNotes((prev) => [saved, ...prev.filter((n) => n.id !== saved.id)]);
      setBody("");
      setKind("GENERAL");
      draftId.current = newRequestId();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save the note.");
      if (unsure) void load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby={`job-notes-${inspectionId}`}
      className="flex h-full flex-col rounded-xl border border-neutral-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-4 shadow-sm space-y-3"
    >
      <h3
        id={`job-notes-${inspectionId}`}
        className="text-sm font-semibold flex items-center gap-2"
      >
        <ChromeChat className="h-4 w-4" />
        Job notes
      </h3>
      <p className="text-xs text-slate-500">
        Every note is stamped with who wrote it and when. A note cannot be
        changed or removed; add a new note to correct one. Deleting the job
        deletes its notes.
      </p>

      <form onSubmit={submit} className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`job-note-kind-${inspectionId}`}>
            Note type
          </label>
          <select
            id={`job-note-kind-${inspectionId}`}
            value={kind}
            onChange={(e) => setKind(e.target.value as JobNoteKindValue)}
            className="min-h-9 rounded-lg border border-neutral-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-xs"
          >
            {JOB_NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {JOB_NOTE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <label className="sr-only" htmlFor={`job-note-body-${inspectionId}`}>
          Note
        </label>
        <textarea
          id={`job-note-body-${inspectionId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={JOB_NOTE_MAX_LENGTH}
          rows={3}
          placeholder="For example: rang the insured, booked the technician for Tuesday 9 am"
          aria-describedby={`job-note-care-${inspectionId}`}
          className="w-full rounded-lg border border-neutral-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        />
        <p
          id={`job-note-care-${inspectionId}`}
          className="text-[11px] text-slate-500"
        >
          Notes are kept permanently and everyone in your business can read
          them. Do not record card numbers, and record health details only where
          the job needs them.
        </p>
        <div className="flex items-center justify-between gap-2">
          {saveError ? (
            <p className="text-xs text-destructive" role="alert">
              {saveError}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={saving || !body.trim()}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-neutral-200 dark:border-slate-600 bg-neutral-50 dark:bg-slate-800 text-xs font-medium px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {saving && <ChromeSpinner className="h-3 w-3 animate-spin" />}
            Add note
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-xs text-slate-500 flex items-center gap-2">
          <ChromeSpinner className="h-3 w-3 animate-spin" /> Loading notes
        </p>
      ) : loadError ? (
        <p className="text-xs text-destructive" role="alert">
          {loadError}
        </p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-500">No notes yet.</p>
      ) : (
        <>
          {truncated && (
            <p className="text-xs text-slate-500">
              Showing the newest notes only; older notes are not shown here.
            </p>
          )}
          <ol aria-label="Job notes, newest first" className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-medium">
                    {n.authorName}
                    <span className="font-normal text-slate-500">
                      {" "}
                      ({jobNoteRoleLabel(n.authorRole)})
                    </span>
                  </span>
                  <time dateTime={n.createdAt} className="text-slate-500">
                    {formatJobNoteTime(n.createdAt)}
                  </time>
                </div>
                <span className="inline-block rounded bg-slate-200/70 dark:bg-slate-700/60 px-1.5 py-0.5 text-[11px]">
                  {kindLabel(n.kind)}
                </span>
                <p className="whitespace-pre-wrap break-words text-sm text-neutral-800 dark:text-slate-200">
                  {n.body}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
