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
import { RAIcon } from "@/src/components/brand/RAIcon";

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
}

export function CapturePhotoTagModal({
  file,
  sha256,
  gps,
  onCancel,
  onSubmit,
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

  if (!file) return null;

  const handleSubmit = () => {
    onSubmit({
      file,
      caption: caption.trim(),
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
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-[#1C2E47] text-white"
          >
            Save photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
