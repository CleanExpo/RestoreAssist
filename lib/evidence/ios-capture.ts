"use client";

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { getCurrentLocation } from "@/lib/capacitor";

export interface IOSCaptureManifest {
  capturedAt: string;
  sha256: string;
  lat: number | null;
  lng: number | null;
}

export interface IOSCaptureResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  manifest: IOSCaptureManifest;
}

// RA-7090: hash the actual captured bytes (the same bytes that get uploaded),
// NOT the Data URL text — a hash over the base64 string never matches a
// server-side hash over the stored file, so it was useless for tamper detection.
export async function sha256Bytes(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function captureEvidencePhoto(): Promise<IOSCaptureResult> {
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  });

  const dataUrl = photo.dataUrl!;
  const blob = await (await fetch(dataUrl)).blob();
  const [locResult, hashResult] = await Promise.allSettled([
    getCurrentLocation(),
    blob.arrayBuffer().then(sha256Bytes),
  ]);

  const loc = locResult.status === "fulfilled" ? locResult.value : null;
  const sha256 = hashResult.status === "fulfilled" ? hashResult.value : "";
  const mimeType = `image/${photo.format}`;
  const filename = `capture-${Date.now()}.${photo.format}`;

  return {
    blob,
    filename,
    mimeType,
    manifest: {
      capturedAt: new Date().toISOString(),
      sha256,
      lat: loc?.latitude ?? null,
      lng: loc?.longitude ?? null,
    },
  };
}
