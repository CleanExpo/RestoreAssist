"use client";

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { getCurrentLocation } from "@/lib/capacitor";

export interface IOSCaptureManifest {
  capturedAt: string;
  sha256: string;
  lat: number | null;
  lng: number | null;
  // RA-7090 slice 2: GPS accuracy travels into the signed manifest so the
  // verifier (and later a court) can weigh the location claim.
  accuracy: number | null;
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

// RA-7090: guided capture must upload the ORIGINAL asset, not just metadata.
// Builds the multipart payload for POST /api/inspections/[id]/evidence —
// carries the byte hash so the server can verify the stored bytes.
export function buildEvidenceFormData(
  capture: IOSCaptureResult,
  fields: {
    workflowStepId: string;
    evidenceClass: string;
    /** Defaults to IOS_CAPACITOR for native camera captures. */
    deviceType?: string;
  },
  // RA-7090 slice 2: optional signed manifest — when the device has a
  // registered Ed25519 key, the canonical manifest bytes + signature ride
  // along and the server verifies before granting signed status.
  signed?: { manifestJson: string; signature: string },
): FormData {
  const form = new FormData();
  form.append("file", capture.blob, capture.filename);
  form.append("sha256", capture.manifest.sha256);
  form.append("evidenceClass", fields.evidenceClass);
  form.append("workflowStepId", fields.workflowStepId);
  form.append("deviceType", fields.deviceType ?? "IOS_CAPACITOR");
  if (capture.manifest.lat !== null) {
    form.append("capturedLat", String(capture.manifest.lat));
  }
  if (capture.manifest.lng !== null) {
    form.append("capturedLng", String(capture.manifest.lng));
  }
  form.append(
    "structuredData",
    JSON.stringify({ c2paManifest: capture.manifest }),
  );
  if (signed) {
    form.append("signedManifest", signed.manifestJson);
    form.append("manifestSignature", signed.signature);
  }
  return form;
}

/**
 * Build a capture result from a browser File / Blob (web guided capture).
 * Hashes the same bytes that will be uploaded so the evidence route can
 * verify against Cloudinary-stored content.
 */
export async function evidencePhotoFromFile(
  file: File | Blob,
  filenameHint?: string,
): Promise<IOSCaptureResult> {
  const mimeType =
    file.type ||
    (file instanceof File && file.type) ||
    "application/octet-stream";
  const filename =
    (file instanceof File && file.name) ||
    filenameHint ||
    `capture-${Date.now()}.${mimeType.includes("png") ? "png" : mimeType.includes("pdf") ? "pdf" : "jpg"}`;

  const [loc, sha256] = await Promise.all([
    getCurrentLocation().catch(() => null),
    file.arrayBuffer().then(sha256Bytes),
  ]);

  return {
    blob: file,
    filename,
    mimeType,
    manifest: {
      capturedAt: new Date().toISOString(),
      sha256,
      lat: loc?.latitude ?? null,
      lng: loc?.longitude ?? null,
      accuracy: loc?.accuracy ?? null,
    },
  };
}

/**
 * Open a file picker (camera-preferring on mobile) for web evidence capture.
 * Rejects if the user cancels without selecting a file.
 */
export function pickEvidencePhotoFile(options?: {
  accept?: string;
}): Promise<File> {
  const accept =
    options?.accept ??
    "image/jpeg,image/png,image/webp,image/*,application/pdf,video/*,.doc,.docx";

  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("File picker is only available in the browser"));
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.setAttribute("capture", "environment");
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      fn();
    };
    const onFocus = () => {
      // After the OS picker closes, window regains focus. If onchange did not
      // fire with a file, treat as cancel (Chrome/Safari without cancel event).
      window.setTimeout(() => {
        finish(() => reject(new Error("Capture cancelled")));
      }, 300);
    };
    input.onchange = () => {
      const f = input.files?.[0];
      finish(() => {
        if (!f) reject(new Error("No file selected"));
        else resolve(f);
      });
    };
    input.addEventListener("cancel", () => {
      finish(() => reject(new Error("Capture cancelled")));
    });
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}

// RA-7090 review fix: a retried POST of the SAME capture must be genuinely
// idempotent — derive the key from capture identity (byte hash + capture
// time), not a fresh random UUID per attempt.
// Round 3 (Codex #2): the key must ALSO be scoped by submission context
// (inspection / workflow step / evidence class). The server fingerprint
// includes those fields, so a context-free key made a legitimate submission
// of the same capture to a DIFFERENT inspection or step collide into a
// false 409.
// Review round 1 (MUST-FIX 4): `variant` scopes a retry whose SUBMISSION
// SHAPE differs — re-sending unsigned after the device key was revoked has a
// different server-side fingerprint, so reusing the signed attempt's key
// would collide into a false 409 and block the technician entirely.
export async function evidenceIdempotencyKey(
  manifest: IOSCaptureManifest,
  context: {
    inspectionId: string;
    workflowStepId?: string | null;
    evidenceClass: string;
    variant?: string;
  },
): Promise<string> {
  const key = [
    "evidence",
    context.inspectionId,
    context.workflowStepId || "none",
    context.evidenceClass,
    manifest.sha256,
    manifest.capturedAt,
    ...(context.variant ? [context.variant] : []),
  ].join("-");
  // Server bound is 8-255 printable-ASCII chars. With cuid ids, enum class
  // names, a 64-char hash and a 24-char ISO timestamp the composite sits
  // near ~175 chars. If an oversized id ever pushes past the cap, hash the
  // FULL composite — context still differentiates the key (final round: a
  // hash+time-only fallback would reintroduce the cross-context false 409).
  if (key.length <= 255) return key;
  const digest = await sha256Bytes(
    new TextEncoder().encode(key).buffer as ArrayBuffer,
  );
  return `evidence-${digest}-${manifest.capturedAt}`;
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
  // RA-7090 review fix: the hash is the custody tripwire — a hashing failure
  // must FAIL the capture, never degrade to sha256:"" inside a legal record.
  // Location stays best-effort.
  const [loc, sha256] = await Promise.all([
    getCurrentLocation().catch(() => null),
    blob.arrayBuffer().then(sha256Bytes),
  ]);

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
      accuracy: loc?.accuracy ?? null,
    },
  };
}
