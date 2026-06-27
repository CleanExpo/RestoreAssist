/**
 * SP-E: GoogleDriveStorageProvider — org-scoped Drive provider.
 *
 * NOTE: Per the spec (§4.2) and the SP-E plan, Drive is NOT the primary
 * write path on the hot photo-upload route. Supabase remains primary;
 * a background mirror queue (lib/queue/storage-mirror.ts) pushes a copy
 * to Drive after the Supabase write succeeds. This class exists so that
 *
 *  - the `getStorageProvider` dispatcher has a real provider to return
 *    for `download` / `getSignedUrl` / `listByInspection` once a future
 *    SP wires "fully BYOK, skip Supabase" mode, and
 *  - the mirror queue can invoke the org-scoped upload path through a
 *    typed surface rather than calling `uploadToDrive` directly.
 *
 * Read-only paths (download / signed URLs / list) throw `NotImplemented`
 * until that fully-BYOK mode lands. Callers should use the Supabase
 * provider for those reads in v1.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";
import { uploadToDrive, downloadFromDrive } from "@/lib/cloud-mirror/drive";
import type {
  StorageProvider,
  UploadInput,
  UploadOutput,
  BatchUploadResult,
} from "./types";

export class GoogleDriveStorageProvider implements StorageProvider {
  constructor(private readonly orgId: string) {}

  async upload(input: UploadInput): Promise<UploadOutput> {
    const org = await prisma.organization.findUnique({
      where: { id: this.orgId },
      select: {
        storageProviderRefreshToken: true,
        storageProviderAccessToken: true,
        storageProviderTokenExpiresAt: true,
      },
    });

    if (!org?.storageProviderRefreshToken) {
      throw new Error(
        `Google Drive is not connected for org ${this.orgId}. ` +
          `Connect at /dashboard/settings/storage and retry.`,
      );
    }

    const refreshToken = decrypt(org.storageProviderRefreshToken);
    const accessToken = org.storageProviderAccessToken
      ? decrypt(org.storageProviderAccessToken)
      : "";

    // Folder convention: RestoreAssist/<jobNumber>/<filename>. The mirror
    // queue resolves jobNumber from the inspection/report. For direct calls
    // (rare in v1), fall back to the inspectionId so files don't pile up
    // at the root.
    const jobNumber = input.inspectionId ?? "unfiled";

    const { providerFileId, viewUrl } = await uploadToDrive({
      accessToken,
      refreshToken,
      jobNumber,
      filename: input.filename,
      mimeType: input.mimeType,
      data: input.buffer,
    });

    const sha256 = crypto
      .createHash("sha256")
      .update(input.buffer)
      .digest("hex");

    return {
      originalUrl: viewUrl,
      // Drive doesn't run the Supabase compression pipeline — the caller
      // already holds compressed/thumbnail URLs from the Supabase write.
      compressedUrl: "",
      thumbnailUrl: "",
      storagePath: providerFileId,
      compressedPath: "",
      thumbnailPath: "",
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

  /**
   * Read a file back from the org's Drive by its Drive file id. Used by the
   * restore engine. (The interface `download(path)` stays unimplemented — it
   * is path-based and not how restore addresses Drive objects.)
   */
  async downloadByFileId(fileId: string): Promise<Buffer> {
    const org = await prisma.organization.findUnique({
      where: { id: this.orgId },
      select: {
        storageProviderRefreshToken: true,
        storageProviderAccessToken: true,
      },
    });
    if (!org?.storageProviderRefreshToken) {
      throw new Error(
        `[invalid_grant] Google Drive not connected for org ${this.orgId}`,
      );
    }
    const refreshToken = decrypt(org.storageProviderRefreshToken);
    const accessToken = org.storageProviderAccessToken
      ? decrypt(org.storageProviderAccessToken)
      : "";
    return downloadFromDrive({ accessToken, refreshToken, fileId });
  }

  async download(_storagePath: string, _bucket?: string): Promise<Buffer> {
    throw new Error(
      "GoogleDriveStorageProvider.download() is not implemented in v1 — " +
        "use SupabaseStorageProvider for reads (Drive is mirror-only).",
    );
  }

  async delete(_storagePath: string, _bucket?: string): Promise<void> {
    throw new Error(
      "GoogleDriveStorageProvider.delete() is not implemented in v1.",
    );
  }

  async getSignedUrl(
    _storagePath: string,
    _expiresInSeconds = 3600,
  ): Promise<string> {
    throw new Error(
      "GoogleDriveStorageProvider.getSignedUrl() is not implemented in v1.",
    );
  }

  async listByInspection(
    _orgId: string,
    _inspectionId: string,
  ): Promise<{ path: string; bucket: string }[]> {
    // Returning empty is safer than throwing — list-by-inspection is used
    // by debug / admin tooling that calls every provider and merges results.
    return [];
  }
}
