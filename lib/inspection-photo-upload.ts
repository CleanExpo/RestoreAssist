"use client";

import { compressImageForUpload } from "./image-compression";

export class PhotoUploadError extends Error {
  constructor(message: string, readonly queueable: boolean) {
    super(message);
    this.name = "PhotoUploadError";
  }
}

/** Convert HEIC/HEIF selected from an iPhone library before the photo API's
 * JPEG/PNG/GIF/WebP signature check. Keep supported files byte-for-byte. */
export async function prepareInspectionPhoto(file: File): Promise<File> {
  if (!/\.(heic|heif)$/i.test(file.name) && !/^image\/hei[cf]$/i.test(file.type)) {
    return file;
  }
  // Some iPhone library pickers omit MIME. Give the decoder the type implied
  // by the HEIC/HEIF extension; the server still validates output magic bytes.
  const typed = /^image\/hei[cf]$/i.test(file.type) ? file : new File([file], file.name, {
    type: /\.heif$/i.test(file.name) ? "image/heif" : "image/heic",
    lastModified: file.lastModified,
  });
  const converted = await compressImageForUpload(typed);
  if (converted.skipped || !["image/webp", "image/png"].includes(converted.format) || converted.blob.size === 0) {
    throw new Error("This HEIC photo could not convert on this device. Export it as JPEG or PNG and choose it again.");
  }
  const extension = converted.format === "image/png" ? ".png" : ".webp";
  return new File([converted.blob], file.name.replace(/\.(heic|heif)$/i, "") + extension, {
    type: converted.format,
    lastModified: file.lastModified,
  });
}

/** A 201 is followed by a fresh owner-scoped listing before a photo is shown
 * as attached. The caller retains the same key and File if readback fails. */
export async function uploadInspectionPhoto(
  inspectionId: string,
  file: File,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
  fields?: Record<string, string>,
): Promise<{ id: string; url: string; [key: string]: unknown }> {
  const path = `/api/inspections/${encodeURIComponent(inspectionId)}/photos`;
  const form = new FormData();
  form.append("file", file);
  for (const [name, value] of Object.entries(fields ?? {})) form.append(name, value);
  const response = await fetcher(path, {
    method: "POST",
    body: form,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = typeof body?.error === "string"
      ? body.error
      : typeof body?.error?.message === "string"
        ? body.error.message
        : typeof body?.message === "string"
          ? body.message
          : `Photo upload failed (${response.status})`;
    throw new PhotoUploadError(message, response.status >= 500 || response.status === 429);
  }
  const posted = await response.json().catch(() => null);
  const photoId = posted?.photo?.id;
  if (typeof photoId !== "string" || !photoId) {
    throw new PhotoUploadError("Upload response did not identify the saved photo. Keep this file and retry to verify it.", true);
  }
  return verifyInspectionPhoto(inspectionId, photoId, fetcher);
}

export async function verifyInspectionPhoto(
  inspectionId: string,
  photoId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; url: string; [key: string]: unknown }> {
  const path = `/api/inspections/${encodeURIComponent(inspectionId)}/photos`;
  const readback = await fetcher(path, { cache: "no-store" });
  if (!readback.ok) {
    throw new PhotoUploadError("Upload may have succeeded, but could not verify that the photo attached. Retry verification.", true);
  }
  const listed = await readback.json().catch(() => null);
  const saved = Array.isArray(listed?.photos)
    ? listed.photos.find((photo: { id?: string }) => photo.id === photoId)
    : null;
  if (!saved || typeof saved.url !== "string" || !saved.url.trim()) {
    throw new PhotoUploadError("Upload may have succeeded, but could not verify that the photo attached. Retry verification.", true);
  }
  return saved;
}
