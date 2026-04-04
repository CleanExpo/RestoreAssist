/**
 * Stub S3/GCS/Azure BYOS provider — not yet implemented.
 * Exists to satisfy the StorageProvider interface for future enterprise clients
 * who bring their own storage bucket (BYOE: Bring Your Own Everything, RA-409).
 */

import type {
  StorageProvider,
  UploadInput,
  UploadOutput,
  BatchUploadResult,
} from "./types";

export class ExternalS3Provider implements StorageProvider {
  constructor(private readonly bucketUrl: string) {}

  upload(_input: UploadInput): Promise<UploadOutput> {
    return Promise.reject(
      new Error(
        `ExternalS3Provider is not yet implemented. Configure Supabase storage or wait for RA-409. Bucket URL: ${this.bucketUrl}`,
      ),
    );
  }

  uploadBatch(
    _inputs: UploadInput[],
    _concurrency?: number,
  ): Promise<BatchUploadResult> {
    return Promise.reject(
      new Error("ExternalS3Provider is not yet implemented."),
    );
  }

  download(_storagePath: string, _bucket?: string): Promise<Buffer> {
    return Promise.reject(
      new Error("ExternalS3Provider is not yet implemented."),
    );
  }

  delete(_storagePath: string, _bucket?: string): Promise<void> {
    return Promise.reject(
      new Error("ExternalS3Provider is not yet implemented."),
    );
  }

  getSignedUrl(
    _storagePath: string,
    _expiresInSeconds?: number,
  ): Promise<string> {
    return Promise.reject(
      new Error("ExternalS3Provider is not yet implemented."),
    );
  }

  listByInspection(
    _orgId: string,
    _inspectionId: string,
  ): Promise<{ path: string; bucket: string }[]> {
    return Promise.reject(
      new Error("ExternalS3Provider is not yet implemented."),
    );
  }
}
