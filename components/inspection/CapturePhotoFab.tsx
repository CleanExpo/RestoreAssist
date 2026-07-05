"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import toast from "react-hot-toast";
import { computeSha256, getCurrentGps } from "@/lib/capture/cocoa-client";
import { queueEvidenceUpload } from "@/lib/evidence-upload-queue";
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
  }) => void;
}

export function CapturePhotoFab({ inspectionId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const [hash, location] = await Promise.all([
        computeSha256(f),
        getCurrentGps(),
      ]);
      setSha256(hash);
      setGps(location ? { lat: location.lat, lng: location.lng } : null);
    } catch {
      setSha256(null);
    }
  }

  async function handleSubmit(payload: CaptureSubmitPayload) {
    setUploading(true);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueForLater(payload);
        return;
      }

      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("caption", payload.caption);
      formData.append("cocoaSha256", payload.sha256);
      formData.append("capturedAtUtc", payload.capturedAtUtc);
      if (payload.gps) {
        formData.append("gpsLat", String(payload.gps.lat));
        formData.append("gpsLng", String(payload.gps.lng));
      }

      let res: Response;
      try {
        res = await fetch(`/api/inspections/${inspectionId}/photos`, {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        // fetch() throws TypeError on network failure (offline mid-flight,
        // DNS/connection drop) — queue instead of hard-failing (RA-6997).
        if (err instanceof TypeError) {
          await queueForLater(payload);
          return;
        }
        throw err;
      }

      if (res.status >= 500) {
        // Transient server-side failure — queue and retry on reconnect.
        await queueForLater(payload);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Photo upload failed");
        return;
      }
      onUploaded?.(data.photo ?? data);
      toast.success("Photo saved");
      resetCapture();
    } finally {
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
  async function queueForLater(payload: CaptureSubmitPayload) {
    try {
      await queueEvidenceUpload({
        inspectionId,
        blob: payload.file,
        filename: payload.file.name,
        mimeType: payload.file.type,
        caption: payload.caption,
        gps: payload.gps,
        capturedAtUtc: payload.capturedAtUtc,
      });
      toast.success("Saved — will upload when back online");
      resetCapture();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to queue photo";
      toast.error(msg);
    }
  }

  function resetCapture() {
    setFile(null);
    setSha256(null);
    setGps(null);
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
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
          setFile(null);
          setSha256(null);
          setGps(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}
