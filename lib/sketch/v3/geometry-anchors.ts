/**
 * geometry-anchors.ts — server helpers for the V3 evidence-anchor join table.
 *
 * `GeometryAnchor` rows bind evidence (moisture readings, photos, voice notes,
 * progress attestations) to specific wall-graph geometry IDs. Two integrity
 * rules are enforced here:
 *
 *   1. **Anchor-on-create**: when an evidence row references geometry, the
 *      anchor row is inserted in the same transaction as the evidence write.
 *      Callers from `lib/progress/guards/*` use `createAnchor` for this.
 *
 *   2. **Deletion safety**: a wall/corner/opening/room can only be deleted if
 *      no anchor references it. `assertNoAnchors` is called by the V3
 *      persistence transaction before it deletes geometry; if any references
 *      remain the API returns 409 with the count and the user re-anchors
 *      first.
 *
 * Server-only — no React imports. Unit-testable with the same Prisma mock
 * used by `persistence.ts`.
 */

export type GeometryType = "CORNER" | "WALL" | "OPENING" | "ROOM";

export interface AnchorEvidenceRefs {
  moistureReadingId?: string;
  inspectionPhotoId?: string;
  attestationId?: string;
  voiceNoteId?: string;
}

export interface CreateAnchorInput extends AnchorEvidenceRefs {
  floorPlanId: string;
  geometryType: GeometryType;
  geometryId: string;
}

export interface MinimalAnchorPrisma {
  geometryAnchor: {
    create: (args: { data: unknown }) => Promise<{ id: string }>;
    count: (args: { where: unknown }) => Promise<number>;
    findMany: (args: { where: unknown; select?: unknown }) => Promise<unknown[]>;
    deleteMany: (args: { where: unknown }) => Promise<unknown>;
  };
}

export class AnchorIntegrityError extends Error {
  constructor(
    message: string,
    readonly geometryId: string,
    readonly anchorCount: number,
  ) {
    super(message);
    this.name = "AnchorIntegrityError";
  }
}

function exactlyOneEvidenceRef(input: AnchorEvidenceRefs): boolean {
  const refs = [
    input.moistureReadingId,
    input.inspectionPhotoId,
    input.attestationId,
    input.voiceNoteId,
  ].filter(Boolean);
  return refs.length === 1;
}

/**
 * Insert a single anchor row. Polymorphic — exactly one of the evidence ref
 * fields must be set. Caller guarantees the geometry exists; we don't
 * cross-check (it would race with the same-transaction insert pattern).
 */
export async function createAnchor(
  prisma: MinimalAnchorPrisma,
  input: CreateAnchorInput,
): Promise<{ id: string }> {
  if (!exactlyOneEvidenceRef(input)) {
    throw new Error(
      "GeometryAnchor must reference exactly one evidence row (moistureReadingId | inspectionPhotoId | attestationId | voiceNoteId)",
    );
  }
  return prisma.geometryAnchor.create({
    data: {
      floorPlanId: input.floorPlanId,
      geometryType: input.geometryType,
      geometryId: input.geometryId,
      moistureReadingId: input.moistureReadingId,
      inspectionPhotoId: input.inspectionPhotoId,
      attestationId: input.attestationId,
      voiceNoteId: input.voiceNoteId,
    },
  });
}

/**
 * Throw if any anchor row still references the listed geometry IDs. Used by
 * the V3 persistence transaction before it deletes geometry.
 */
export async function assertNoAnchors(
  prisma: MinimalAnchorPrisma,
  geometryIds: string[],
): Promise<void> {
  if (geometryIds.length === 0) return;
  const count = await prisma.geometryAnchor.count({
    where: { geometryId: { in: geometryIds } },
  });
  if (count > 0) {
    throw new AnchorIntegrityError(
      `Cannot delete ${geometryIds.length} geometry row(s) — ${count} evidence anchor(s) reference them`,
      geometryIds.join(","),
      count,
    );
  }
}

/**
 * Required-evidence check for the Stage × Evidence matrix. Looks for at least
 * one anchor matching every required `(geometryType, geometryId)` tuple.
 *
 * Returns `{ ok: false, missing }` when any tuple has zero anchors so the
 * progress state-machine can return `{ ok: false, missing }` per Rule 23.
 */
export async function checkRequiredAnchors(
  prisma: MinimalAnchorPrisma,
  required: Array<{ geometryType: GeometryType; geometryId: string }>,
): Promise<
  | { ok: true }
  | { ok: false; missing: Array<{ geometryType: GeometryType; geometryId: string }> }
> {
  if (required.length === 0) return { ok: true };
  const found = (await prisma.geometryAnchor.findMany({
    where: {
      OR: required.map((r) => ({
        geometryType: r.geometryType,
        geometryId: r.geometryId,
      })),
    },
    select: { geometryType: true, geometryId: true },
  })) as Array<{ geometryType: GeometryType; geometryId: string }>;

  const foundKey = new Set(found.map((r) => `${r.geometryType}:${r.geometryId}`));
  const missing = required.filter(
    (r) => !foundKey.has(`${r.geometryType}:${r.geometryId}`),
  );
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
