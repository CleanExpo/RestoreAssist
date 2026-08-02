/**
 * Cloudinary implementation of StorageProvider.
 *
 * Used as the default primary store for inspection photos when Supabase
 * Storage is not the intended host (local/dev and Cloudinary-first deploys).
 * Stores durable CDN URLs on InspectionPhoto.url / thumbnailUrl.
 */

import { deleteImage, uploadToCloudinary } from "@/lib/cloudinary";
import { computeSha256 } from "./compression";
import type {
  StorageProvider,
  UploadInput,
  UploadOutput,
  BatchUploadResult,
} from "./types";

export class CloudinaryStorageProvider implements StorageProvider {
  async upload(input: UploadInput): Promise<UploadOutput> {
    const sha256 = computeSha256(input.buffer);
    const folder = input.inspectionId
      ? `inspection-photos/${input.orgId}/${input.inspectionId}`
      : `inspection-photos/${input.orgId}/${input.folder || "uploads"}`;

    const result = await uploadToCloudinary(input.buffer, {
      folder,
      resource_type: "image",
    });

    // Cloudinary delivers optimised delivery URLs; we keep the same
    // secure_url for original + compressed so the photos API contract
    // (compressedUrl → InspectionPhoto.url) stays unchanged.
    return {
      originalUrl: result.url,
      compressedUrl: result.url,
      thumbnailUrl: result.thumbnailUrl ?? result.url,
      storagePath: result.publicId,
      compressedPath: result.publicId,
      thumbnailPath: result.publicId,
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

    for (let i = 0; i < inputs.length; i += concurrency) {
      const slice = inputs.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        slice.map(async (input) => {
          const out = await this.upload(input);
          return { ...out, filename: input.filename };
        }),
      );
      for (let j = 0; j < settled.length; j++) {
        const result = settled[j];
        if (result.status === "fulfilled") {
          succeeded.push(result.value);
        } else {
          failed.push({
            filename: slice[j].filename,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      }
    }

    return { succeeded, failed };
  }

  async download(storagePath: string): Promise<Buffer> {
    // storagePath is the Cloudinary public_id — fetch via the delivery URL.
    const url = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${storagePath}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `[cloudinary] Download failed for ${storagePath}: ${res.status}`,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(storagePath: string): Promise<void> {
    await deleteImage(storagePath);
  }

  async getSignedUrl(storagePath: string): Promise<string> {
    // Public Cloudinary delivery URLs don't need signing.
    if (storagePath.startsWith("http")) return storagePath;
    return `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${storagePath}`;
  }

  async listByInspection(
    _orgId: string,
    _inspectionId: string,
  ): Promise<{ path: string; bucket: string }[]> {
    // Listing by prefix requires Admin API search — not used on the photo
    // upload hot path. Return empty rather than inventing a partial index.
    return [];
  }
}
