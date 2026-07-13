/**
 * SP-E: OneDriveStorageProvider — org-scoped mirror using the org owner's
 * linked azure-ad Account tokens (same as OneDriveCloudMirror).
 */

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
      data: input.data,
    });
    return {
      storagePath: result.providerFileId,
      publicUrl: result.viewUrl,
    };
  }

  async uploadBatch(): Promise<BatchUploadResult> {
    throw new Error("OneDriveStorageProvider.uploadBatch is not implemented");
  }

  async download(): Promise<Buffer> {
    throw new Error("OneDriveStorageProvider.download is not implemented");
  }

  async getSignedUrl(): Promise<string> {
    throw new Error("OneDriveStorageProvider.getSignedUrl is not implemented");
  }

  async delete(): Promise<void> {
    throw new Error("OneDriveStorageProvider.delete is not implemented");
  }

  async listByInspection(): Promise<{ path: string; url: string }[]> {
    throw new Error(
      "OneDriveStorageProvider.listByInspection is not implemented",
    );
  }
}
