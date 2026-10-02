"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RAIcon } from "@/components/brand/RAIcon";

export interface CaptureSubmitPayload {
  file: File;
  caption: string;
  sha256: string;
  gps: { lat: number; lng: number } | null;
  capturedAtUtc: string;
}

interface Props {
  file: File | null;
  sha256: string | null;
  gps: { lat: number; lng: number } | null;
  onCancel: () => void;
  onSubmit: (payload: CaptureSubmitPayload) => void;
  uploading?: boolean;
  lockedCaption?: string | null;
}

export function CapturePhotoTagModal({
  file,
  sha256,
  gps,
  onCancel,
  onSubmit,
  uploading = false,
  lockedCaption = null,
}: Props) {
  const [caption, setCaption] = useState("");
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!file) setCaption("");
  }, [file]);

  if (!file) return null;

  const handleSubmit = () => {
    onSubmit({
      file,
      caption: lockedCaption ?? caption.trim(),
      sha256: sha256 ?? "",
      gps,
      capturedAtUtc: new Date().toISOString(),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Capture evidence</DialogTitle>
        </DialogHeader>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full aspect-square object-cover rounded"
          />
        )}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <RAIcon name="map" size={13} decorative className="mr-1" />
            {gps
              ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`
              : "GPS unavailable"}
          </p>
          <p>
            <RAIcon name="calendar" size={13} decorative className="mr-1" />
            {new Date().toISOString().replace("T", " ").slice(0, 16)} UTC
          </p>
          {sha256 && (
            <p>
              <RAIcon name="shield" size={13} decorative className="mr-1" />
              SHA-256: {sha256.slice(0, 16)}…
            </p>
          )}
        </div>
        <Input
          placeholder="Description (optional, e.g. 'moisture in north wall behind dishwasher')"
          value={lockedCaption ?? caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={lockedCaption !== null}
          maxLength={500}
        />
        {lockedCaption !== null && <p role="status" className="text-xs text-amber-700">This photo and caption are fixed while its earlier upload is unverified. Retry the same request, or cancel after saving an original copy and checking the job photo list.</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={uploading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={uploading || !sha256}
            className="flex-1 bg-brand-navy text-white"
          >
            {uploading ? "Saving…" : "Save photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
