"use client";

/**
 * ContentsItemPhoto — RA-8537 slice 2, item photos.
 *
 * One photo slot (before or after) on a contents pack-out item. The photo
 * goes up through the job's one photo path, POST /api/inspections/[id]/photos
 * via uploadInspectionPhoto, which checks the bytes, records the custody hash
 * and reads the photo back before it counts as saved. Only then does the slot
 * hand the verified URL to its owner, which stores it on the item. If the
 * upload fails, the chosen file and its idempotency key are kept so a retry
 * cannot create a second photo.
 */

import { useRef, useState } from "react";
import {
  prepareInspectionPhoto,
  uploadInspectionPhoto,
} from "@/lib/inspection-photo-upload";

export type ContentsPhotoStage = "before" | "after";

const STAGE_LABEL: Record<ContentsPhotoStage, string> = {
  before: "Before photo",
  after: "After photo",
};

/** The photos route's own stage vocabulary (InspectionPhoto.photoStage). */
const STAGE_FIELD: Record<ContentsPhotoStage, string> = {
  before: "PRE_WORK",
  after: "POST_WORK",
};

export function ContentsItemPhoto({
  inspectionId,
  stage,
  itemDescription,
  url,
  onChange,
  disabled = false,
}: {
  inspectionId: string;
  stage: ContentsPhotoStage;
  /** Used for the photo's caption on the job's photo list. */
  itemDescription: string;
  url: string | null;
  /** Receives the verified photo URL, or null to clear. Resolves false if the
   * item could not be updated, so the slot keeps showing the error. */
  onChange: (url: string | null) => Promise<boolean> | boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ file: File; key: string } | null>(null);
  const label = STAGE_LABEL[stage];

  async function upload(file: File, key: string) {
    setBusy(true);
    setError(null);
    let prepared = file;
    try {
      prepared = await prepareInspectionPhoto(file);
      const description = itemDescription.trim() || "contents item";
      const saved = await uploadInspectionPhoto(
        inspectionId,
        prepared,
        key,
        fetch,
        {
          location: "Contents",
          caption: `Contents ${stage} photo: ${description}`,
          photoStage: STAGE_FIELD[stage],
        },
      );
      if (await onChange(saved.url)) {
        setRetry(null);
      } else {
        setRetry({ file: prepared, key });
        setError("The photo uploaded but could not be linked to this item.");
      }
    } catch (cause) {
      setRetry({ file: prepared, key });
      setError(cause instanceof Error ? cause.message : "Photo upload failed");
    } finally {
      setBusy(false);
    }
  }

  function choose(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void upload(file, `contents-photo-${crypto.randomUUID()}`);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      if (!(await onChange(null))) setError("Could not remove the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1" data-testid={`contents-photo-${stage}`}>
      <span className="text-xs text-neutral-500 block">{label}</span>
      {url ? (
        <div className="flex items-center gap-2">
          <img
            src={url}
            alt={`${label} of ${itemDescription.trim() || "contents item"}`}
            className="h-14 w-14 rounded-md object-cover border border-neutral-200 dark:border-slate-700"
          />
          <button
            type="button"
            onClick={() => void remove()}
            disabled={disabled || busy}
            className="rounded border border-neutral-200 dark:border-slate-700 px-2 py-1 text-xs text-neutral-600 dark:text-slate-300 disabled:opacity-50"
          >
            Remove {label.toLowerCase()}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="rounded-lg border border-dashed border-neutral-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-slate-200 disabled:opacity-50"
        >
          {busy ? "Uploading…" : `Add ${label.toLowerCase()}`}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={`Choose ${label.toLowerCase()}`}
        className="hidden"
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = "";
        }}
      />
      {error && (
        <div role="alert" className="text-xs text-destructive space-y-1">
          <p>{error}</p>
          {retry && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void upload(retry.file, retry.key)}
              className="rounded border px-2 py-0.5 disabled:opacity-50"
            >
              Retry {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
