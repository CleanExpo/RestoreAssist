/**
 * Storage provider factory.
 * Returns the correct StorageProvider implementation based on the organisation's config.
 * Defaults to SupabaseStorageProvider for all existing organisations (null storageProvider).
 */

import { prisma } from "@/lib/prisma";
import { SupabaseStorageProvider } from "./supabase-provider";
import { ExternalS3Provider } from "./s3-provider";
import type { StorageProvider } from "./types";

export { BUCKET_ORIGINALS, BUCKET_OPTIMISED } from "./types";
export type {
  StorageProvider,
  UploadInput,
  UploadOutput,
  BatchUploadResult,
} from "./types";

/**
 * Resolve the storage provider for an organisation.
 * Pass orgId as undefined/null to get the default Supabase provider
 * (e.g. for users without an org, or during onboarding).
 */
export async function getStorageProvider(
  orgId: string | null | undefined,
): Promise<StorageProvider> {
  if (!orgId) {
    return new SupabaseStorageProvider();
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { storageProvider: true, storageBucketUrl: true },
  });

  if (!org) {
    // Org not found — fall back to default Supabase provider
    return new SupabaseStorageProvider();
  }

  switch (org.storageProvider) {
    case "S3":
    case "GCS":
    case "AZURE":
      return new ExternalS3Provider(org.storageBucketUrl ?? "");
    case "SUPABASE":
    default:
      return new SupabaseStorageProvider();
  }
}
