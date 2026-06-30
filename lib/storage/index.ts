/**
 * Storage provider factory.
 * Returns the correct StorageProvider implementation based on the organisation's config.
 * Defaults to SupabaseStorageProvider for all existing organisations (null storageProvider).
 */

import { prisma } from "@/lib/prisma";
import { SupabaseStorageProvider } from "./supabase-provider";
import { GoogleDriveStorageProvider } from "./google-drive-provider";
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
      // BYOS (RA-409) is not implemented. Fail fast at resolution rather than
      // returning a provider that rejects on every call — a misconfigured org
      // must surface immediately, not silently on the first upload.
      throw new Error(
        `Storage provider "${org.storageProvider}" (bring-your-own-storage) is not implemented yet (RA-409). Configure SUPABASE or GOOGLE_DRIVE.`,
      );
    case "GOOGLE_DRIVE":
    case "ONEDRIVE":
    case "LOCAL":
      // SP-E ships dual-write: Supabase stays primary, the mirror queue
      // pushes a background copy to Drive. The hot photo-upload path
      // resolves Supabase here; only the queue invokes
      // `getMirrorStorageProvider` below for the secondary Drive write.
      return new SupabaseStorageProvider();
    case "SUPABASE":
    default:
      return new SupabaseStorageProvider();
  }
}

/**
 * SP-E: Resolve the mirror-side storage provider for an org.
 *
 * Returns null if the org is not configured for dual-write (i.e. the
 * primary provider IS its source of truth — no mirror needed).
 *
 * Only the mirror queue (`lib/queue/storage-mirror.ts`) should call this.
 * Callers on the hot write path use `getStorageProvider` and stay on
 * Supabase.
 */
export async function getMirrorStorageProvider(
  orgId: string,
): Promise<StorageProvider | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { storageProvider: true },
  });

  if (!org) return null;

  switch (org.storageProvider) {
    case "GOOGLE_DRIVE":
      return new GoogleDriveStorageProvider(orgId);
    // ONEDRIVE / LOCAL are placeholder enum values in v1 — no provider yet.
    default:
      return null;
  }
}
