/**
 * SP-E: OneDriveStorageProvider — org-scoped mirror using the org owner's
 * linked azure-ad Account tokens (same as OneDriveCloudMirror).
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { uploadToOneDrive } from "@/lib/cloud-mirror/onedrive";
import { decryptAccountTokens } from "@/lib/auth/account-tokens";
import type {
  StorageProvider,
  UploadInput,
  UploadOutput,
  BatchUploadResult,
} from "./types";

export class OneDriveStorageProvider implements StorageProvider {
  constructor(private readonly orgId: string) {}

  private async getOwnerAccessToken(): Promise<string> {
    const org = await prisma.organization.findUnique({
      where: { id: this.orgId },
      select: { ownerId: true },
    });
    if (!org?.ownerId) {
      throw new Error(`Organization ${this.orgId} not found`);
    }

    const account = await prisma.account.findFirst({
      where: { userId: org.ownerId, provider: "azure-ad" },
      select: { access_token: true },
    });
    if (!account?.access_token) {
      throw new Error(
        `OneDrive is not connected for org ${this.orgId}. ` +
          `Connect at /dashboard/settings/cloud-mirror and retry.`,
      );
    }
    const tokens = decryptAccountTokens(account);
    if (!tokens.access_token) {
      throw new Error("OneDrive access token missing or invalid");
    }
    return tokens.access_token;
  }

  async upload(input: UploadInput): Promise<UploadOutput> {
    const accessToken = await this.getOwnerAccessToken();
    const jobNumber = input.inspectionId ?? "unfiled";
    const result = await uploadToOneDrive({
      accessToken,
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
      originalUrl: result.viewUrl,
      // OneDrive doesn't run the Supabase compression pipeline — callers
      // already hold compressed/thumbnail URLs from the primary write.
      compressedUrl: "",
      thumbnailUrl: "",
      storagePath: result.providerFileId,
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

  async download(_storagePath: string, _bucket?: string): Promise<Buffer> {
    throw new Error(
      "OneDriveStorageProvider.download() is not implemented in v1.",
    );
  }

  async getSignedUrl(
    _storagePath: string,
    _expiresInSeconds = 3600,
  ): Promise<string> {
    throw new Error(
      "OneDriveStorageProvider.getSignedUrl() is not implemented in v1.",
    );
  }

  async delete(_storagePath: string, _bucket?: string): Promise<void> {
    throw new Error(
      "OneDriveStorageProvider.delete() is not implemented in v1.",
    );
  }

  async listByInspection(
    _orgId: string,
    _inspectionId: string,
  ): Promise<{ path: string; bucket: string }[]> {
    // Empty is safer than throwing — list tooling merges every provider.
    return [];
  }
}
