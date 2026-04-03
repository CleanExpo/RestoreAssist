/**
 * Supabase Storage utilities for sketch media — RA2-004 (RA-90)
 *
 * Bucket: sketch-media (public, auto-created via SQL below)
 *
 * Path structure:
 *   sketch-media/
 *     inspections/{inspectionId}/underlays/{filename}   — floor plan underlays
 *     inspections/{inspectionId}/photos/{filename}      — photo markers
 *     inspections/{inspectionId}/exports/{filename}     — exported PNG/PDF
 *
 * Setup SQL (run once in Supabase SQL editor):
 * ─────────────────────────────────────────────
 *   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
 *   VALUES (
 *     'sketch-media',
 *     'sketch-media',
 *     true,
 *     10485760,  -- 10 MB per file
 *     ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
 *   ) ON CONFLICT (id) DO NOTHING;
 *
 *   CREATE POLICY "Authenticated users can upload sketch media"
 *     ON storage.objects FOR INSERT TO authenticated
 *     WITH CHECK (bucket_id = 'sketch-media');
 *
 *   CREATE POLICY "Authenticated users can delete own sketch media"
 *     ON storage.objects FOR DELETE TO authenticated
 *     USING (bucket_id = 'sketch-media' AND auth.uid()::text = owner);
 *
 *   CREATE POLICY "Anyone can read sketch media"
 *     ON storage.objects FOR SELECT TO public
 *     USING (bucket_id = 'sketch-media');
 */

import { supabase } from "./supabase"

const BUCKET = "sketch-media"
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

// ── Path helpers ──────────────────────────────────────────

export function underlayPath(inspectionId: string, fileName: string): string {
  return `inspections/${inspectionId}/underlays/${fileName}`
}

export function photoPath(inspectionId: string, fileName: string): string {
  return `inspections/${inspectionId}/photos/${fileName}`
}

export function exportPath(inspectionId: string, fileName: string): string {
  return `inspections/${inspectionId}/exports/${fileName}`
}

// ── Image optimisation ────────────────────────────────────

/**
 * Resize an image Blob to fit within maxDimension px on the longest side,
 * re-encoding as JPEG at the given quality (0–1). Returns the resized Blob.
 *
 * Falls back to the original Blob if canvas is unavailable (SSR).
 */
export async function resizeImage(
  blob: Blob,
  maxDimension = 2400,
  quality = 0.85
): Promise<Blob> {
  if (typeof window === "undefined") return blob

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= maxDimension && height <= maxDimension) {
        resolve(blob)
        return
      }
      if (width > height) {
        height = Math.round((height * maxDimension) / width)
        width = maxDimension
      } else {
        width = Math.round((width * maxDimension) / height)
        height = maxDimension
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (resized) => resolve(resized ?? blob),
        "image/jpeg",
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob) }
    img.src = url
  })
}

// ── Upload ────────────────────────────────────────────────

export interface UploadResult {
  path: string
  publicUrl: string
}

/**
 * Upload a file Blob to the sketch-media bucket.
 * Optionally resizes images (floor plan underlays) before uploading.
 */
export async function uploadSketchMedia(
  blob: Blob,
  storagePath: string,
  options: {
    resize?: boolean
    maxDimension?: number
    quality?: number
  } = {}
): Promise<UploadResult> {
  if (blob.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds 10 MB limit (${(blob.size / 1024 / 1024).toFixed(1)} MB)`)
  }

  const finalBlob =
    options.resize !== false && blob.type.startsWith("image/")
      ? await resizeImage(blob, options.maxDimension ?? 2400, options.quality ?? 0.85)
      : blob

  const contentType = finalBlob.type || "application/octet-stream"

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, finalBlob, { contentType, upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return { path: storagePath, publicUrl: data.publicUrl }
}

// ── Convenience wrappers ──────────────────────────────────

/** Upload a floor plan underlay image (resized to 2400px max). */
export async function uploadFloorPlanUnderlay(
  blob: Blob,
  inspectionId: string
): Promise<UploadResult> {
  const ext = blob.type === "image/png" ? "png" : "jpg"
  const fileName = `${Date.now()}.${ext}`
  return uploadSketchMedia(blob, underlayPath(inspectionId, fileName), {
    resize: true,
    maxDimension: 2400,
  })
}

/** Upload a photo marker image (resized to 1200px max). */
export async function uploadPhotoMarker(
  blob: Blob,
  inspectionId: string
): Promise<UploadResult> {
  const ext = blob.type === "image/png" ? "png" : "jpg"
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  return uploadSketchMedia(blob, photoPath(inspectionId, fileName), {
    resize: true,
    maxDimension: 1200,
    quality: 0.82,
  })
}

/** Upload an exported sketch PNG (no resize — keep full quality). */
export async function uploadSketchExport(
  blob: Blob,
  inspectionId: string,
  label: string
): Promise<UploadResult> {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
  const fileName = `${safe}-${Date.now()}.png`
  return uploadSketchMedia(blob, exportPath(inspectionId, fileName), { resize: false })
}

// ── Delete ────────────────────────────────────────────────

/** Remove a file from sketch-media by its storage path. */
export async function deleteSketchMedia(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (error) throw new Error(`Storage delete failed: ${error.message}`)
}

// ── Public URL ────────────────────────────────────────────

/** Get the public URL for a stored path. */
export function getSketchMediaUrl(storagePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// ── Data URL → Blob ───────────────────────────────────────

/** Convert a canvas.toDataURL() string to a Blob for uploading. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",")
  const mimeMatch = header.match(/:(.*?);/)
  const mime = mimeMatch?.[1] ?? "image/png"
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
