/**
 * Storage provider factory.
 * Returns the correct StorageProvider implementation based on the organisation's config.
 *
 * Default primary store is Cloudinary (durable CDN URLs on InspectionPhoto).
 * Supabase remains available for restore/mirror tooling that constructs it
 * directly; org-level GOOGLE_DRIVE / ONEDRIVE still dual-write via the mirror
 * queue when configured.
 */

import { prisma } from "@/lib/prisma";
import { CloudinaryStorageProvider } from "./cloudinary-provider";
import { GoogleDriveStorageProvider } from "./google-drive-provider";
import { OneDriveStorageProvider } from "./onedrive-provider";
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
 * Pass orgId as undefined/null to get the default Cloudinary provider
 * (e.g. for users without an org, or during onboarding).
 */
export async function getStorageProvider(
  orgId: string | null | undefined,
): Promise<StorageProvider> {
  if (!orgId) {
    return new CloudinaryStorageProvider();
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { storageProvider: true, storageBucketUrl: true },
  });

  if (!org) {
    return new CloudinaryStorageProvider();
  }

  switch (org.storageProvider) {
    case "S3":
    case "GCS":
    case "AZURE":
      // BYOS (RA-409) is not implemented. Fail fast at resolution rather than
      // returning a provider that rejects on every call — a misconfigured org
      // must surface immediately, not silently on the first upload.
      throw new Error(
        `Storage provider "${org.storageProvider}" (bring-your-own-storage) is not implemented yet (RA-409). Configure Cloudinary (default) or GOOGLE_DRIVE.`,
      );
    case "GOOGLE_DRIVE":
    case "ONEDRIVE":
    case "LOCAL":
      // SP-E dual-write: Cloudinary stays primary; the mirror queue pushes a
      // background copy to Drive/OneDrive when configured.
      return new CloudinaryStorageProvider();
    case "SUPABASE":
      // Product default is Cloudinary for inspection photos. Orgs still marked
      // SUPABASE in the enum use Cloudinary unless a future flag re-enables
      // Supabase as primary (requires NEXT_PUBLIC_SUPABASE_URL + service role).
      return new CloudinaryStorageProvider();
    default:
      return new CloudinaryStorageProvider();
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
 * the primary (Cloudinary).
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
    case "ONEDRIVE":
      return new OneDriveStorageProvider(orgId);
    default:
      return null;
  }
}
