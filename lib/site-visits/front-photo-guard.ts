/**
 * RA-8498 — a photo in use as a site visit's front-of-property photo is not
 * deleted on its own.
 *
 * `SiteVisit.frontPhotoId` is ON DELETE NO ACTION, so the database refuses
 * such a delete anyway. The two writers that delete `InspectionPhoto` rows
 * (photos/[photoId] DELETE and evidence DELETE) ask here first, so the
 * technician gets a sentence that says what to do instead of a constraint
 * error. One owner for the lookup and the wording; both routes call it.
 */
import type { Prisma } from "@prisma/client";

type VisitReader = { siteVisit: { findMany: (args: Prisma.SiteVisitFindManyArgs) => Promise<unknown[]> } };

/**
 * The visit numbers on this job whose front photo is the given photo
 * (by id, or by the stored file URL the evidence route deletes by). Empty
 * when the photo may be deleted.
 */
export async function visitsUsingFrontPhoto(
  db: VisitReader,
  inspectionId: string,
  photo: { id: string } | { url: string },
): Promise<number[]> {
  const where: Prisma.SiteVisitWhereInput =
    "id" in photo
      ? { inspectionId, frontPhotoId: photo.id }
      : { inspectionId, frontPhoto: { url: photo.url } };
  const rows = (await db.siteVisit.findMany({
    where,
    select: { visitNumber: true },
    orderBy: { visitNumber: "asc" },
    take: 10,
  })) as Array<{ visitNumber: number }>;
  return rows.map((r) => r.visitNumber);
}

export function frontPhotoInUseMessage(visitNumbers: readonly number[]): string {
  const which = visitNumbers.map((n) => `visit ${n}`).join(", ");
  return `This photo is the front of property photo for ${which}. Choose a different front photo on that visit before deleting it.`;
}

/** Thrown inside a transaction so the whole delete rolls back. */
export class FrontPhotoInUseError extends Error {
  constructor(readonly visitNumbers: number[]) {
    super(frontPhotoInUseMessage(visitNumbers));
    this.name = "FrontPhotoInUseError";
  }
}
