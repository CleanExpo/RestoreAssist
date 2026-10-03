"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import toast from "react-hot-toast";
import { computeSha256, getCurrentGps } from "@/lib/capture/cocoa-client";
import { queueEvidenceUpload } from "@/lib/evidence-upload-queue";
import { prepareInspectionPhoto, verifyInspectionPhoto } from "@/lib/inspection-photo-upload";
import {
  CapturePhotoTagModal,
  type CaptureSubmitPayload,
} from "./CapturePhotoTagModal";

interface Props {
  inspectionId: string;
  inspectionStatus: string;
  onUploaded?: (photo: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    [key: string]: unknown;
  }) => void;
}

export function CapturePhotoFab({ inspectionId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const pendingSubmitRef = useRef<{ key: string; payload: CaptureSubmitPayload } | null>(null);
  const [lockedCaption, setLockedCaption] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (pendingSubmitRef.current) {
      toast.error("Resolve or explicitly close the pending photo before choosing another file");
      e.target.value = "";
      return;
    }
    const selected = e.target.files?.[0];
    if (!selected) return;
    try {
      const f = await prepareInspectionPhoto(selected);
      const [hash, location] = await Promise.all([
        computeSha256(f),
        getCurrentGps(),
      ]);
      setFile(f);
      setSha256(hash);
      setGps(location ? { lat: location.lat, lng: location.lng } : null);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not prepare photo");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(payload: CaptureSubmitPayload) {
    if (submittingRef.current || !payload.sha256) return;
    // Reuse the exact body and key after any uncertain POST or readback.
    pendingSubmitRef.current ??= { key: `photo-${crypto.randomUUID()}`, payload };
    setLockedCaption(pendingSubmitRef.current.payload.caption);
    const { key: retryKey, payload: submission } = pendingSubmitRef.current;
    submittingRef.current = true;
    setUploading(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueForLater(submission, retryKey);
        return;
      }

      const formData = new FormData();
      formData.append("file", submission.file);
      formData.append("caption", submission.caption);
      formData.append("cocoaSha256", submission.sha256);
      formData.append("capturedAtUtc", submission.capturedAtUtc);
      if (submission.gps) {
        formData.append("gpsLat", String(submission.gps.lat));
        formData.append("gpsLng", String(submission.gps.lng));
      }

      let res: Response;
      try {
        res = await fetch(`/api/inspections/${inspectionId}/photos`, {
          method: "POST",
          body: formData,
          headers: { "Idempotency-Key": retryKey },
        });
      } catch (err) {
        // fetch() throws TypeError on network failure (offline mid-flight,
        // DNS/connection drop) — queue instead of hard-failing (RA-6997).
        if (err instanceof TypeError) {
          await queueForLater(submission, retryKey);
          return;
        }
        throw err;
      }

      if (res.status >= 500 || [408, 409, 425, 429].includes(res.status)) {
        // Transient server-side failure — queue and retry on reconnect.
        await queueForLater(submission, retryKey);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A definite rejection did not create a photo. Permit correction with
        // a fresh request identity; uncertain failures retain their snapshot.
        pendingSubmitRef.current = null;
        setLockedCaption(null);
        toast.error(typeof data.error === "string"
          ? data.error
          : typeof data.error?.message === "string"
            ? data.error.message
            : typeof data.message === "string"
              ? data.message
              : "Photo upload failed");
        return;
      }
      const photoId = data.photo?.id;
      try {
        if (typeof photoId !== "string") throw new Error("Photo readback unavailable");
        const verified = await verifyInspectionPhoto(inspectionId, photoId);
        onUploaded?.({
          ...verified,
          thumbnailUrl: typeof verified.thumbnailUrl === "string" ? verified.thumbnailUrl : null,
        });
      } catch {
        await queueForLater(submission, retryKey);
        return;
      }
      toast.success("Photo saved");
      resetCapture();
    } finally {
      submittingRef.current = false;
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /**
   * RA-6997 — fall back to the IndexedDB offline queue instead of
   * hard-failing when offline or on a network/5xx error. The queue
   * recomputes the chain-of-custody hash over its own (compressed) bytes —
   * see lib/evidence-upload-queue.ts — so `payload.sha256` (hashed
   * pre-compression for the direct fast-path above) is not reused here.
   */
  async function queueForLater(payload: CaptureSubmitPayload, retryKey?: string) {
    try {
      await queueEvidenceUpload({
        inspectionId,
        blob: payload.file,
        filename: payload.file.name,
        mimeType: payload.file.type,
        caption: payload.caption,
        gps: payload.gps,
        capturedAtUtc: payload.capturedAtUtc,
        directRetryKey: retryKey,
        directCocoaSha256: retryKey ? payload.sha256 : undefined,
      });
      toast.success("Saved on this device — upload will be verified on sync");
      resetCapture();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to queue photo";
      toast.error(msg);
    }
  }

  function resetCapture() {
    pendingSubmitRef.current = null;
    setLockedCaption(null);
    setFile(null);
    setSha256(null);
    setGps(null);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        aria-label="Capture photo"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-brand-navy text-white shadow-lg flex items-center justify-center hover:bg-brand-navy-hover disabled:opacity-50"
      >
        <Camera className="w-6 h-6" />
      </button>
      <CapturePhotoTagModal
        file={file}
        sha256={sha256}
        gps={gps}
        onCancel={() => {
          if (pendingSubmitRef.current && !window.confirm("This photo is not verified on the job. Save an original copy before closing if you need it; an uncertain upload may already exist. Close this selection?")) return;
          resetCapture();
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        onSubmit={handleSubmit}
        uploading={uploading}
        lockedCaption={lockedCaption}
      />
    </>
  );
}
