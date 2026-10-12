"use client";

import { useRef, useState } from "react";
import { PhotoUploadError, prepareInspectionPhoto, uploadInspectionPhoto } from "@/lib/inspection-photo-upload";
import { queueEvidenceUpload } from "@/lib/evidence-upload-queue";

type PendingPhoto = { key: string; file: File; prepared: boolean; error: string | null };

/** Shares truthful upload/readback and in-page retry across both photo screens. */
export function InspectionPhotoUploadControl({
  inspectionId,
  onVerified,
  label = "Upload Photo",
  multiple = false,
}: {
  inspectionId: string;
  onVerified: (photo: { id: string; url: string; [key: string]: unknown }) => void;
  label?: string;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);

  async function attempt(entry: PendingPhoto) {
    let file = entry.file;
    let prepared = entry.prepared;
    try {
      if (!entry.prepared) {
        file = await prepareInspectionPhoto(file);
        prepared = true;
        setPending((rows) => rows.map((row) => row.key === entry.key ? { ...row, file, prepared: true } : row));
      }
      const saved = await uploadInspectionPhoto(inspectionId, file, entry.key);
      onVerified(saved);
      setPending((rows) => rows.filter((row) => row.key !== entry.key));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Photo upload failed";
      if (prepared && (!(cause instanceof PhotoUploadError) || cause.queueable)) {
        try {
          await queueEvidenceUpload({
            inspectionId,
            blob: file,
            filename: file.name,
            mimeType: file.type,
            directRetryKey: entry.key,
          });
          setPending((rows) => rows.filter((row) => row.key !== entry.key));
          return;
        } catch (queueError) {
          const detail = queueError instanceof Error ? queueError.message : "Could not save locally";
          setPending((rows) => rows.map((row) => row.key === entry.key ? { ...row, file, prepared, error: `${message}. ${detail}` } : row));
          return;
        }
      }
      setPending((rows) => rows.map((row) => row.key === entry.key ? { ...row, file, prepared, error: message } : row));
    }
  }

  async function run(entries: PendingPhoto[]) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      for (const entry of entries) await attempt(entry);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function select(files: FileList | null) {
    if (!files?.length) return;
    const rows = Array.from(files).map((file) => ({
      key: `photo-${crypto.randomUUID()}`,
      file,
      prepared: false,
      error: null,
    }));
    setPending((current) => [...current, ...rows]);
    void run(rows);
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Uploading…" : label}
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} aria-label="Choose inspection photos" className="hidden" onChange={(event) => {
        select(event.target.files);
        event.target.value = "";
      }} />
      {pending.length > 0 && (
        <div role="status" className="space-y-2 text-sm">
          {pending.map((entry) => (
            <div key={entry.key} className="rounded border border-amber-500/40 p-2">
              <p>{entry.file.name}: {entry.error ?? "Uploading and verifying…"}</p>
              {entry.error && (
                <button type="button" disabled={busy} onClick={() => void run([entry])} className="mt-1 rounded border px-2 py-1 disabled:opacity-50">Retry this photo</button>
              )}
            </div>
          ))}
          <p>Keep this page open until uploads are verified. If an upload cannot complete, the photo stays available for retry here.</p>
        </div>
      )}
    </div>
  );
}
