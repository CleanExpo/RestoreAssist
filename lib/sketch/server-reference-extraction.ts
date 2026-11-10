import "server-only";

/**
 * RA-8236: bind a room-suggestion read to one stored floor-plan reference.
 *
 * The bytes come from the private `sketch-media` bucket by the path on the
 * custody row, and must hash to that row's contentSha256. Nothing here takes a
 * URL. A completed read is kept on the append-only audit trail, keyed by
 * floor and hash, so a retry or an identical re-upload replays it for free.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const REFERENCE_EXTRACTION_ACTION =
  "Reference floor plan read for room suggestions";
export const REFERENCE_EXTRACTION_ENTITY = "SketchUnderlayExtraction";

/**
 * A running read holds its key for the lease. The whole read must end inside
 * the deadline, so the key can never expire while a paid call is still open.
 */
export const REFERENCE_READ_LEASE_MS = 150_000;
export const REFERENCE_READ_DEADLINE_MS = 120_000;
/** Below this, there is not enough time left to start a paid call. */
export const REFERENCE_READ_MIN_WINDOW_MS = 5_000;

const MAX_FLOOR = 50;
const MAX_STORED_BYTES = 10 * 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface ReferenceBinding {
  referenceId: string;
  contentSha256: string;
  floorNumber: number;
}

export interface BoundReference {
  id: string;
  storagePath: string;
  contentSha256: string;
}

export interface RecordedRead {
  rooms: unknown[];
  reader: unknown;
  promptVersion: unknown;
}

export type StoredReferenceRead =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: "unavailable" | "hash_mismatch" };

export function parseReferenceBinding(value: unknown): ReferenceBinding | null {
  if (!value || typeof value !== "object") return null;
  const { referenceId, contentSha256, floorNumber } = value as Record<
    string,
    unknown
  >;
  if (
    typeof referenceId !== "string" ||
    !referenceId ||
    referenceId.length > 64 ||
    typeof contentSha256 !== "string" ||
    !SHA256_HEX.test(contentSha256) ||
    typeof floorNumber !== "number" ||
    !Number.isInteger(floorNumber) ||
    floorNumber < 0 ||
    floorNumber > MAX_FLOOR
  ) {
    return null;
  }
  return { referenceId, contentSha256, floorNumber };
}

/** The active, attested, locally uploaded reference this binding names, or null. */
export async function findBoundReference(
  inspectionId: string,
  binding: ReferenceBinding,
): Promise<BoundReference | null> {
  const row = await prisma.sketchUnderlayReference.findFirst({
    where: {
      id: binding.referenceId,
      inspectionId,
      floorNumber: binding.floorNumber,
      contentSha256: binding.contentSha256,
      replacedAt: null,
      removedAt: null,
    },
    select: {
      id: true,
      storagePath: true,
      sourceType: true,
      contentSha256: true,
      mimeType: true,
      holdsRights: true,
      compliesWithSourceTerms: true,
    },
  });
  if (
    !row ||
    row.sourceType !== "upload" ||
    !row.holdsRights ||
    !row.compliesWithSourceTerms ||
    row.mimeType !== "image/png" ||
    !row.storagePath.startsWith(`inspections/${inspectionId}/underlays/`)
  ) {
    return null;
  }
  return {
    id: row.id,
    storagePath: row.storagePath,
    contentSha256: row.contentSha256,
  };
}

export function extractionEntityId(binding: ReferenceBinding): string {
  return `${binding.floorNumber}:${binding.contentSha256}`;
}

export async function findRecordedExtraction(
  inspectionId: string,
  binding: ReferenceBinding,
  db: Pick<Prisma.TransactionClient, "auditLog"> = prisma,
): Promise<RecordedRead | null> {
  const row = await db.auditLog.findFirst({
    where: {
      inspectionId,
      action: REFERENCE_EXTRACTION_ACTION,
      entityType: REFERENCE_EXTRACTION_ENTITY,
      entityId: extractionEntityId(binding),
    },
    orderBy: { timestamp: "desc" },
    select: { changes: true },
  });
  if (!row?.changes) return null;
  try {
    const parsed = JSON.parse(row.changes) as Partial<RecordedRead>;
    if (!Array.isArray(parsed.rooms)) return null;
    return {
      rooms: parsed.rooms,
      reader: parsed.reader,
      promptVersion: parsed.promptVersion,
    };
  } catch {
    return null;
  }
}

/**
 * Spending is decided by a row written before the paid call, never by the
 * absence of a row written after it. A started read with no "not charged" row
 * may have been billed, whatever happened next: an expired lock, a crash, a
 * timeout, or a failed save. Counting rows keeps the trail append-only.
 */
export const REFERENCE_PAID_READ_ENTITY = "SketchUnderlayPaidRead";
export const REFERENCE_PAID_READ_STARTED =
  "Reference floor plan paid read started";
export const REFERENCE_PAID_READ_NOT_CHARGED =
  "Reference floor plan paid read not charged";

/**
 * The only provider outcomes that free a read for a retry: each is a refusal
 * that returned no model output. Every other outcome stays held, because a
 * charge cannot be ruled out. An allow-list, so a new reason starts out held.
 */
const PROVIDER_REFUSED_WITHOUT_READING: ReadonlySet<string> = new Set([
  "KEY_MISSING",
  "KEY_INVALID",
  "RATE_LIMITED",
  "MODEL_OVERLOADED",
]);

export function providerRefusedWithoutReading(reason: string): boolean {
  return PROVIDER_REFUSED_WITHOUT_READING.has(reason);
}

export type PaidReadClaim =
  | { kind: "claimed" }
  | { kind: "recorded"; recorded: RecordedRead }
  | { kind: "possibly_charged" };

function paidReadRow(
  inspectionId: string,
  binding: ReferenceBinding,
  action: string,
) {
  return {
    inspectionId,
    action,
    entityType: REFERENCE_PAID_READ_ENTITY,
    entityId: extractionEntityId(binding),
  };
}

/** The caller must hold the writer lock for this floor and hash on `db`. */
export async function claimPaidRead(
  inspectionId: string,
  binding: ReferenceBinding,
  userId: string,
  db: Pick<Prisma.TransactionClient, "auditLog">,
): Promise<PaidReadClaim> {
  const recorded = await findRecordedExtraction(inspectionId, binding, db);
  if (recorded) return { kind: "recorded", recorded };
  const started = await db.auditLog.count({
    where: paidReadRow(inspectionId, binding, REFERENCE_PAID_READ_STARTED),
  });
  const notCharged = await db.auditLog.count({
    where: paidReadRow(inspectionId, binding, REFERENCE_PAID_READ_NOT_CHARGED),
  });
  if (started > notCharged) return { kind: "possibly_charged" };
  await db.auditLog.create({
    data: {
      ...paidReadRow(inspectionId, binding, REFERENCE_PAID_READ_STARTED),
      userId,
    },
  });
  return { kind: "claimed" };
}

/** Call only when the paid call provably did not run or returned no output. */
export async function releasePaidRead(
  inspectionId: string,
  binding: ReferenceBinding,
  userId: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      ...paidReadRow(inspectionId, binding, REFERENCE_PAID_READ_NOT_CHARGED),
      userId,
    },
  });
}

/** Read the private stored bytes and prove they are the attested bytes. */
export async function readBoundReferenceBytes(
  reference: BoundReference,
): Promise<StoredReferenceRead> {
  const { data, error } = await getSupabaseServerClient()
    .storage.from("sketch-media")
    .download(reference.storagePath);
  if (error || !data || data.size > MAX_STORED_BYTES) {
    return { ok: false, reason: "unavailable" };
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  return hash === reference.contentSha256
    ? { ok: true, bytes }
    : { ok: false, reason: "hash_mismatch" };
}
