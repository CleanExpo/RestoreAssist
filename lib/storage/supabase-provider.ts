/**
 * Supabase Storage implementation of StorageProvider.
 * Server-only — uses the service-role client.
 */

import { randomUUID } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  compressImage,
  computeSha256,
  isImageMimeType,
  getOptimisedExtension,
} from "./compression";
import type {
  StorageProvider,
  UploadInput,
  UploadOutput,
  BatchUploadResult,
} from "./types";
import { BUCKET_ORIGINALS, BUCKET_OPTIMISED } from "./types";

// Signed-URL lifetime for private evidence buckets (P0-1). Reads re-sign from
// the stored storage path, so this is the immediate-use view window, not a
// durable link.
const SIGNED_URL_TTL_SECONDS = 3600;

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

function buildPaths(
  orgId: string,
  inspectionId: string | undefined,
  uuid: string,
  originalExt: string,
  optimisedExt: string,
) {
  const prefix = inspectionId
    ? `${orgId}/${inspectionId}/${uuid}`
    : `${orgId}/${uuid}`;
  return {
    originalPath: `${prefix}-original.${originalExt}`,
    compressedPath: `${prefix}-compressed.${optimisedExt}`,
    thumbnailPath: `${prefix}-thumb.${optimisedExt}`,
  };
}

export class SupabaseStorageProvider implements StorageProvider {
  async upload(input: UploadInput): Promise<UploadOutput> {
    const supabase = getSupabaseServerClient();
    const uuid = randomUUID();
    const originalExt = getFileExtension(input.filename);
    const sha256 = computeSha256(input.buffer);
    const isImage = isImageMimeType(input.mimeType);

    // Originals-only: private original write, nothing to the public CDN. Used
    // for unreviewed/quarantined uploads (client-portal evidence) so they can't
    // be path-guessed from the public bucket before staff review.
    if (input.originalsOnly) {
      const originalExtOnly = getFileExtension(input.filename);
      const { originalPath } = buildPaths(
        input.orgId,
        input.inspectionId,
        uuid,
        originalExtOnly,
        originalExtOnly,
      );
      const { error: origOnlyErr } = await supabase.storage
        .from(BUCKET_ORIGINALS)
        .upload(originalPath, input.buffer, {
          contentType: input.mimeType,
          upsert: false,
        });
      if (origOnlyErr)
        throw new Error(
          `[storage] Original upload failed: ${origOnlyErr.message}`,
        );

      const { data: signedOnly, error: signOnlyErr } = await supabase.storage
        .from(BUCKET_ORIGINALS)
        .createSignedUrl(originalPath, 3600);
      if (signOnlyErr || !signedOnly?.signedUrl) {
        throw new Error(
          `[storage] Signed URL generation failed: ${signOnlyErr?.message}`,
        );
      }

      return {
        originalUrl: signedOnly.signedUrl,
        compressedUrl: "",
        thumbnailUrl: "",
        storagePath: originalPath,
        compressedPath: "",
        thumbnailPath: "",
        sizeBytes: input.buffer.byteLength,
        sha256,
      };
    }

    let compressedBuffer: Buffer;
    let thumbnailBuffer: Buffer;
    let optimisedExt: string;

    if (isImage) {
      const result = await compressImage(input.buffer, input.mimeType);
      compressedBuffer = result.compressed;
      thumbnailBuffer = result.thumbnail;
      optimisedExt = getOptimisedExtension(input.mimeType);
    } else {
      // Non-image: store original in both buckets (no compression)
      compressedBuffer = input.buffer;
      thumbnailBuffer = input.buffer;
      optimisedExt = originalExt;
    }

    const { originalPath, compressedPath, thumbnailPath } = buildPaths(
      input.orgId,
      input.inspectionId,
      uuid,
      originalExt,
      optimisedExt,
    );

    // Upload original (private evidence grade)
    const { error: origErr } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .upload(originalPath, input.buffer, {
        contentType: input.mimeType,
        upsert: false,
      });
    if (origErr)
      throw new Error(`[storage] Original upload failed: ${origErr.message}`);

    // Upload compressed (public CDN)
    const compressedMime = isImage ? "image/jpeg" : input.mimeType;
    const { error: compErr } = await supabase.storage
      .from(BUCKET_OPTIMISED)
      .upload(compressedPath, compressedBuffer, {
        contentType: compressedMime,
        upsert: false,
      });
    if (compErr)
      throw new Error(`[storage] Compressed upload failed: ${compErr.message}`);

    // Upload thumbnail (public CDN)
    const { error: thumbErr } = await supabase.storage
      .from(BUCKET_OPTIMISED)
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: compressedMime,
        upsert: false,
      });
    if (thumbErr)
      throw new Error(`[storage] Thumbnail upload failed: ${thumbErr.message}`);

    // Signed URLs for the optimised bucket. The bucket is PRIVATE (P0-1) — a
    // public URL would expose evidence with no auth, so reads go through
    // short-lived signed URLs. Callers persist compressedPath/thumbnailPath and
    // re-sign on read via getSignedUrl(); these URLs are the immediate-use view.
    const { data: compressedData, error: compSignErr } = await supabase.storage
      .from(BUCKET_OPTIMISED)
      .createSignedUrl(compressedPath, SIGNED_URL_TTL_SECONDS);
    const { data: thumbnailData, error: thumbSignErr } = await supabase.storage
      .from(BUCKET_OPTIMISED)
      .createSignedUrl(thumbnailPath, SIGNED_URL_TTL_SECONDS);

    // Original: signed URL since the bucket is private
    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .createSignedUrl(originalPath, SIGNED_URL_TTL_SECONDS);
    if (
      signErr ||
      !signedData?.signedUrl ||
      compSignErr ||
      !compressedData?.signedUrl ||
      thumbSignErr ||
      !thumbnailData?.signedUrl
    ) {
      throw new Error(
        `[storage] Signed URL generation failed: ${signErr?.message ?? compSignErr?.message ?? thumbSignErr?.message}`,
      );
    }

    return {
      originalUrl: signedData.signedUrl,
      compressedUrl: compressedData.signedUrl,
      thumbnailUrl: thumbnailData.signedUrl,
      storagePath: originalPath,
      compressedPath,
      thumbnailPath,
      sizeBytes: input.buffer.byteLength,
      sha256,
    };
  }

  async uploadBatch(
    inputs: UploadInput[],
    concurrency = 3,
  ): Promise<BatchUploadResult> {
    const succeeded: BatchUploadResult["succeeded"] = [];
    const failed: BatchUploadResult["failed"] = [];

    // Process in chunks to respect concurrency limit
    for (let i = 0; i < inputs.length; i += concurrency) {
      const chunk = inputs.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map((input) => this.upload(input)),
      );

      results.forEach((result, idx) => {
        const filename = chunk[idx].filename;
        if (result.status === "fulfilled") {
          succeeded.push({ ...result.value, filename });
        } else {
          failed.push({
            filename,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      });
    }

    return { succeeded, failed };
  }

  async download(
    storagePath: string,
    bucket = BUCKET_ORIGINALS,
  ): Promise<Buffer> {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(storagePath);
    if (error || !data) {
      throw new Error(
        `[storage] Download failed: ${error?.message ?? "No data"}`,
      );
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(storagePath: string, bucket = BUCKET_ORIGINALS): Promise<void> {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.storage.from(bucket).remove([storagePath]);
    if (error) {
      throw new Error(`[storage] Delete failed: ${error.message}`);
    }
  }

  async getSignedUrl(
    storagePath: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(`[storage] Signed URL failed: ${error?.message}`);
    }
    return data.signedUrl;
  }

  /**
   * Cheap existence check: list the parent prefix searching for the filename.
   */
  async exists(
    storagePath: string,
    bucket: string = BUCKET_ORIGINALS,
  ): Promise<boolean> {
    const supabase = getSupabaseServerClient();
    const slash = storagePath.lastIndexOf("/");
    const dir = slash >= 0 ? storagePath.slice(0, slash) : "";
    const name = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dir, { search: name, limit: 1 });
    if (error) {
      throw new Error(`[storage] exists() failed: ${error.message}`);
    }
    return Boolean(data?.some((f) => f.name === name));
  }

  /**
   * Write raw bytes to an EXACT storage path (no path derivation, no
   * compression). Used by the restore engine to re-hydrate originals.
   */
  async restoreToPath(
    storagePath: string,
    buffer: Buffer,
    mimeType: string,
    opts: { upsert?: boolean } = {},
    bucket: string = BUCKET_ORIGINALS,
  ): Promise<void> {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: opts.upsert ?? false,
      });
    if (error) {
      throw new Error(`[storage] restoreToPath failed: ${error.message}`);
    }
  }

  async listByInspection(
    orgId: string,
    inspectionId: string,
  ): Promise<{ path: string; bucket: string }[]> {
    const supabase = getSupabaseServerClient();
    const prefix = `${orgId}/${inspectionId}`;

    const [originalsResult, optimisedResult] = await Promise.all([
      supabase.storage.from(BUCKET_ORIGINALS).list(prefix),
      supabase.storage.from(BUCKET_OPTIMISED).list(prefix),
    ]);

    const results: { path: string; bucket: string }[] = [];

    if (originalsResult.data) {
      originalsResult.data.forEach((f) =>
        results.push({ path: `${prefix}/${f.name}`, bucket: BUCKET_ORIGINALS }),
      );
    }
    if (optimisedResult.data) {
      optimisedResult.data.forEach((f) =>
        results.push({ path: `${prefix}/${f.name}`, bucket: BUCKET_OPTIMISED }),
      );
    }

    return results;
  }
}
