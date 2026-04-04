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

    // Build public URLs for optimised bucket
    const { data: compressedData } = supabase.storage
      .from(BUCKET_OPTIMISED)
      .getPublicUrl(compressedPath);
    const { data: thumbnailData } = supabase.storage
      .from(BUCKET_OPTIMISED)
      .getPublicUrl(thumbnailPath);

    // Original: signed URL (1 hour) since the bucket is private
    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .createSignedUrl(originalPath, 3600);
    if (signErr || !signedData?.signedUrl) {
      throw new Error(
        `[storage] Signed URL generation failed: ${signErr?.message}`,
      );
    }

    return {
      originalUrl: signedData.signedUrl,
      compressedUrl: compressedData.publicUrl,
      thumbnailUrl: thumbnailData.publicUrl,
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
