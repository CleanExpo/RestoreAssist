/**
 * Storage provider interfaces and data types for RA-408.
 * Pure TypeScript — no runtime dependencies.
 */

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Logical folder within the bucket, e.g. "evidence" or "photos" */
  folder: string;
  /** Organisation ID — used for per-org bucket path isolation */
  orgId: string;
  /** Optional inspection ID — used in path structure */
  inspectionId?: string;
}

export interface UploadOutput {
  /** Signed URL (private originals) or public CDN URL (optimised) for original */
  originalUrl: string;
  /** Public CDN URL for compressed version (80% quality, max 2048px) */
  compressedUrl: string;
  /** Public CDN URL for thumbnail (400px) */
  thumbnailUrl: string;
  /** Storage path within the bucket, for future delete / re-signing */
  storagePath: string;
  /** Compressed storage path */
  compressedPath: string;
  /** Thumbnail storage path */
  thumbnailPath: string;
  /** File size of the original in bytes */
  sizeBytes: number;
  /** SHA-256 hash of the original buffer for chain-of-custody */
  sha256: string;
}

export interface BatchUploadResult {
  succeeded: Array<UploadOutput & { filename: string }>;
  failed: Array<{ filename: string; error: string }>;
}

export interface StorageProvider {
  /**
   * Upload a single file. Runs compression pipeline for images.
   * Returns URLs for original, compressed, and thumbnail variants.
   */
  upload(input: UploadInput): Promise<UploadOutput>;

  /**
   * Upload multiple files with bounded concurrency.
   * Uses Promise.allSettled — failures do not cancel other uploads.
   */
  uploadBatch(
    inputs: UploadInput[],
    concurrency?: number,
  ): Promise<BatchUploadResult>;

  /**
   * Download a file as a Buffer.
   */
  download(storagePath: string, bucket?: string): Promise<Buffer>;

  /**
   * Delete a file from storage.
   */
  delete(storagePath: string, bucket?: string): Promise<void>;

  /**
   * Generate a short-lived signed URL for a private file.
   * @param expiresInSeconds - defaults to 3600 (1 hour)
   */
  getSignedUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;

  /**
   * List all storage paths for an inspection (across originals and optimised buckets).
   */
  listByInspection(
    orgId: string,
    inspectionId: string,
  ): Promise<{ path: string; bucket: string }[]>;
}

/** Bucket names used by the Supabase provider */
export const BUCKET_ORIGINALS = "evidence-originals" as const;
export const BUCKET_OPTIMISED = "evidence-optimised" as const;
