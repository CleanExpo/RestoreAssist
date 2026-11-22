/**
 * Contents pack-out item photos (RA-8537 slice 2, item photos).
 *
 * A pack-out item's `beforePhotoUrl` / `afterPhotoUrl` must point at a photo
 * already uploaded to the same job through POST /api/inspections/[id]/photos.
 * That route is the one upload path: it checks the file's bytes, records the
 * chain-of-custody hash, writes the audit row and mirrors to the business's
 * own storage. The pack-out routes never accept a file, only a reference to
 * one of those photos.
 *
 * The client holds the photo's display URL, which for a private Supabase
 * bucket is a short-lived signed URL, not the stored one. So a submitted URL
 * is matched to an `InspectionPhoto` on this job either exactly or by its
 * storage bucket and object path, and the photo's STORED url is what gets
 * written. A URL that matches no photo on the job is refused, so an item can
 * never carry another job's photo or an arbitrary outside link.
 */

import { prisma } from "@/lib/prisma";
import {
  parseSupabaseStorageUrl,
  signStoredMediaUrl,
} from "@/lib/storage/sign-stored-url";

export const PACK_OUT_PHOTO_FIELDS = [
  "beforePhotoUrl",
  "afterPhotoUrl",
] as const;
export type PackOutPhotoField = (typeof PACK_OUT_PHOTO_FIELDS)[number];

export type PackOutPhotoInput = Partial<
  Record<PackOutPhotoField, string | null | undefined>
>;

export type ResolvedPackOutPhotos =
  | { ok: true; data: Partial<Record<PackOutPhotoField, string | null>> }
  | { ok: false; field: PackOutPhotoField };

function sameStoredObject(a: string, b: string): boolean {
  if (a === b) return true;
  const left = parseSupabaseStorageUrl(a);
  const right = parseSupabaseStorageUrl(b);
  return (
    left !== null &&
    right !== null &&
    left.bucket === right.bucket &&
    left.path === right.path
  );
}

/**
 * Resolve each photo field the caller sent to the stored URL of a photo on
 * this inspection. `null` clears the field; an absent field is left out.
 * Returns the first field that matches no photo on the job.
 */
export async function resolvePackOutPhotos(
  inspectionId: string,
  input: PackOutPhotoInput,
): Promise<ResolvedPackOutPhotos> {
  const data: Partial<Record<PackOutPhotoField, string | null>> = {};
  for (const field of PACK_OUT_PHOTO_FIELDS) {
    const submitted = input[field];
    if (submitted === undefined) continue;
    if (submitted === null) {
      data[field] = null;
      continue;
    }
    const ref = parseSupabaseStorageUrl(submitted);
    const candidates = await prisma.inspectionPhoto.findMany({
      where: {
        inspectionId,
        OR: [
          { url: submitted },
          ...(ref ? [{ url: { contains: ref.path } }] : []),
        ],
      },
      select: { url: true },
      take: 20,
    });
    const match = candidates.find((photo) =>
      sameStoredObject(photo.url, submitted),
    );
    if (!match) return { ok: false, field };
    data[field] = match.url;
  }
  return { ok: true, data };
}

/** Re-sign an item's stored photo URLs for display (private buckets, P0-1). */
export async function signPackOutItemPhotos<
  T extends { beforePhotoUrl: string | null; afterPhotoUrl: string | null },
>(item: T): Promise<T> {
  return {
    ...item,
    beforePhotoUrl: (await signStoredMediaUrl(item.beforePhotoUrl)) ?? null,
    afterPhotoUrl: (await signStoredMediaUrl(item.afterPhotoUrl)) ?? null,
  };
}
