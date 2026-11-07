/**
 * Field-complete status for a floor sketch.
 *
 * Honest RestoreAssist analogue of Cotality "lock / sync / release ownership":
 * we persist a local `fieldComplete` flag on the Fabric blob metadata so techs
 * can mark a floor done after scan→confirm→annotate. This is NOT carrier sync
 * and does not invent FML/estimate ownership.
 */

export const SKETCH_META_KEY = "raSketchMeta";

export interface SketchFieldMeta {
  /** Technician marked this floor's sketch as field-complete. */
  fieldComplete?: boolean;
  /** ISO timestamp when marked complete (cleared when unmarked). */
  fieldCompletedAt?: string | null;
  /**
   * RA-7617 — server-authored. Fabric object ids Vision produced on this
   * inspection. A first save cannot claim `operator_measured` for these ids
   * unless the POST lists them in `confirmedFabricObjectIds`. Written by
   * import-from-image; looked up across every floor of the inspection.
   */
  aiSuggestedRoomIds?: string[];
  /**
   * RA-8233 — server-authored. Technician measurement evidence per room,
   * append-only. The sketch POST route rebuilds this from what it stored
   * earlier; a client-posted value is always discarded.
   */
  roomMeasurementEvidence?: RoomMeasurementEvidence[];
}

export type RoomMeasurementEvidenceStatus =
  | "current"
  | "invalidated"
  | "superseded";

/**
 * RA-8233 — one technician measurement of one room, recorded by the server.
 * Bound to the room geometry and scale it was taken against
 * (`geometryRevision`); any later geometry or scale edit invalidates it.
 */
export interface RoomMeasurementEvidence {
  fabricObjectId: string;
  measuredAreaM2: number;
  lengthM: number | null;
  widthM: number | null;
  geometryRevision: string;
  /** Session user id — never a client value. */
  recordedBy: string;
  /** Server clock, ISO — never a client value. */
  recordedAt: string;
  status: RoomMeasurementEvidenceStatus;
  invalidatedAt?: string | null;
  invalidatedReason?: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function readSketchFieldMeta(sketchData: unknown): SketchFieldMeta {
  const root = asRecord(sketchData);
  const meta = asRecord(root?.[SKETCH_META_KEY]);
  if (!meta) return {};
  return {
    fieldComplete: meta.fieldComplete === true,
    fieldCompletedAt:
      typeof meta.fieldCompletedAt === "string" ? meta.fieldCompletedAt : null,
  };
}

export function isSketchFieldComplete(sketchData: unknown): boolean {
  return readSketchFieldMeta(sketchData).fieldComplete === true;
}

function uniqueRoomIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
}

/** Server-remembered Vision room ids stored on the floor's sketch blob. */
export function readAiSuggestedRoomIds(sketchData: unknown): string[] {
  const root = asRecord(sketchData);
  const meta = asRecord(root?.[SKETCH_META_KEY]);
  return uniqueRoomIds(meta?.aiSuggestedRoomIds);
}

/**
 * Union `ids` into `raSketchMeta.aiSuggestedRoomIds`. Never drops ids the
 * server already recorded — a client cannot un-remember an AI room.
 */
export function withAiSuggestedRoomIds(
  sketchData: Record<string, unknown> | null | undefined,
  ids: string[],
): Record<string, unknown> {
  const base: Record<string, unknown> = sketchData ? { ...sketchData } : {};
  const prev = asRecord(base[SKETCH_META_KEY]) ?? {};
  const merged = uniqueRoomIds([
    ...readAiSuggestedRoomIds(base),
    ...ids,
  ]);
  base[SKETCH_META_KEY] = {
    ...prev,
    aiSuggestedRoomIds: merged,
  };
  return base;
}

/**
 * Return a shallow-cloned sketch blob with updated field-complete meta.
 * Preserves Fabric `objects` / background; never invents empty objects.
 */
export function withSketchFieldComplete(
  sketchData: Record<string, unknown> | null | undefined,
  complete: boolean,
  now = new Date(),
): Record<string, unknown> {
  const base: Record<string, unknown> = sketchData ? { ...sketchData } : {};
  const prev = asRecord(base[SKETCH_META_KEY]) ?? {};
  base[SKETCH_META_KEY] = {
    ...prev,
    fieldComplete: complete,
    fieldCompletedAt: complete ? now.toISOString() : null,
  };
  return base;
}

const EVIDENCE_STATUSES: ReadonlySet<string> = new Set([
  "current",
  "invalidated",
  "superseded",
]);

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * RA-8233 — measurement evidence stored on a floor's sketch blob. Only call
 * this on a blob the server persisted; malformed entries are dropped.
 */
export function readRoomMeasurementEvidence(
  sketchData: unknown,
): RoomMeasurementEvidence[] {
  const root = asRecord(sketchData);
  const meta = asRecord(root?.[SKETCH_META_KEY]);
  const raw = meta?.roomMeasurementEvidence;
  if (!Array.isArray(raw)) return [];
  const out: RoomMeasurementEvidence[] = [];
  for (const item of raw) {
    const e = asRecord(item);
    if (!e) continue;
    const area = finiteOrNull(e.measuredAreaM2);
    if (
      typeof e.fabricObjectId !== "string" ||
      e.fabricObjectId.length === 0 ||
      area === null ||
      area <= 0 ||
      typeof e.geometryRevision !== "string" ||
      typeof e.recordedBy !== "string" ||
      e.recordedBy.length === 0 ||
      typeof e.recordedAt !== "string" ||
      typeof e.status !== "string" ||
      !EVIDENCE_STATUSES.has(e.status)
    ) {
      continue;
    }
    out.push({
      fabricObjectId: e.fabricObjectId,
      measuredAreaM2: area,
      lengthM: finiteOrNull(e.lengthM),
      widthM: finiteOrNull(e.widthM),
      geometryRevision: e.geometryRevision,
      recordedBy: e.recordedBy,
      recordedAt: e.recordedAt,
      status: e.status as RoomMeasurementEvidenceStatus,
      invalidatedAt:
        typeof e.invalidatedAt === "string" ? e.invalidatedAt : null,
      invalidatedReason:
        typeof e.invalidatedReason === "string" ? e.invalidatedReason : null,
    });
  }
  return out;
}

/**
 * Replace `raSketchMeta.roomMeasurementEvidence` with the server's list.
 * Whatever the client posted under that key is discarded; with no evidence
 * the key is removed, and a blob without meta is left without meta.
 */
export function withRoomMeasurementEvidence(
  sketchData: Record<string, unknown> | null | undefined,
  evidence: RoomMeasurementEvidence[],
): Record<string, unknown> {
  const base: Record<string, unknown> = sketchData ? { ...sketchData } : {};
  const prev = asRecord(base[SKETCH_META_KEY]);
  if (evidence.length === 0) {
    if (prev && "roomMeasurementEvidence" in prev) {
      const rest = { ...prev };
      delete rest.roomMeasurementEvidence;
      base[SKETCH_META_KEY] = rest;
    }
    return base;
  }
  base[SKETCH_META_KEY] = {
    ...(prev ?? {}),
    roomMeasurementEvidence: evidence,
  };
  return base;
}
