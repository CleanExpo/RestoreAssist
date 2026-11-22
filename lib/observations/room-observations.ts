/**
 * RA-7694: structured room observations (odour, visible growth, staining).
 *
 * One owner for the allowed values and the request check, so the API route, the
 * voice parser and the report all read the same lists. Pure: no database.
 *
 * These records say what the technician saw, smelt or measured. They never name
 * a species, give a diagnosis, or set a condition or clearance. Those belong to
 * a qualified assessor.
 */

export const ROOM_OBSERVATION_KINDS = [
  "ODOUR",
  "VISIBLE_GROWTH",
  "STAINING",
] as const;
export type RoomObservationKind = (typeof ROOM_OBSERVATION_KINDS)[number];

export const ROOM_OBSERVATION_BASES = [
  "OBSERVED",
  "MEASURED",
  "HYPOTHESISED",
] as const;
export type RoomObservationBasis = (typeof ROOM_OBSERVATION_BASES)[number];

export const ROOM_ODOUR_PATTERNS = ["CONSTANT", "INTERMITTENT"] as const;
export type RoomOdourPattern = (typeof ROOM_ODOUR_PATTERNS)[number];

export const ODOUR_INTENSITY_LABEL: Record<number, string> = {
  1: "faint",
  2: "moderate",
  3: "strong",
};

export const MAX_ROOM_LABEL = 120;
export const MAX_SHORT_TEXT = 120;
export const MAX_DETAIL = 1000;
export const MAX_AREA_M2 = 10000;

export interface RoomObservationInput {
  kind: RoomObservationKind;
  basis: RoomObservationBasis;
  sketchRoomId: string | null;
  roomLabel: string | null;
  odourDescriptor: string | null;
  odourIntensity: number | null;
  odourPattern: RoomOdourPattern | null;
  areaM2: number | null;
  surface: string | null;
  detail: string | null;
  observedAt: Date | null;
}

export type RoomObservationCheck =
  | { ok: true; data: RoomObservationInput }
  | { ok: false; message: string };

// Explicit ISO 8601 date-time with a zone. `new Date("2020")` would otherwise
// turn a bare year into a timestamp that prints as a wrong day.
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type TextResult = { ok: true; value: string | null } | { ok: false };

/** Absent or blank is null. A value that is not text, or is too long, fails. */
function text(v: unknown, max: number): TextResult {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const t = v.trim();
  if (t === "") return { ok: true, value: null };
  if (t.length > max) return { ok: false };
  return { ok: true, value: t };
}

/**
 * Checks a create request. Fields that belong to another kind are refused, not
 * ignored, so a record never carries a value the report would then print under
 * the wrong heading.
 */
export function checkRoomObservationInput(body: unknown): RoomObservationCheck {
  if (!isRecord(body)) return { ok: false, message: "Body must be an object" };

  const kind = body.kind;
  if (!ROOM_OBSERVATION_KINDS.includes(kind as RoomObservationKind)) {
    return {
      ok: false,
      message: `kind must be one of: ${ROOM_OBSERVATION_KINDS.join(", ")}`,
    };
  }
  const k = kind as RoomObservationKind;

  const basisRaw = body.basis ?? "OBSERVED";
  if (!ROOM_OBSERVATION_BASES.includes(basisRaw as RoomObservationBasis)) {
    return {
      ok: false,
      message: `basis must be one of: ${ROOM_OBSERVATION_BASES.join(", ")}`,
    };
  }

  const room = text(body.roomLabel, MAX_ROOM_LABEL);
  if (!room.ok) {
    return {
      ok: false,
      message: `roomLabel must be text of at most ${MAX_ROOM_LABEL} characters`,
    };
  }

  let sketchRoomId: string | null = null;
  if (body.sketchRoomId !== undefined && body.sketchRoomId !== null) {
    if (typeof body.sketchRoomId !== "string" || body.sketchRoomId === "") {
      return { ok: false, message: "sketchRoomId must be a room id" };
    }
    sketchRoomId = body.sketchRoomId;
  }
  if (!sketchRoomId && !room.value) {
    return { ok: false, message: "Name the room: sketchRoomId or roomLabel" };
  }

  const descriptor = text(body.odourDescriptor, MAX_SHORT_TEXT);
  const surface = text(body.surface, MAX_SHORT_TEXT);
  const detail = text(body.detail, MAX_DETAIL);
  if (!descriptor.ok || !surface.ok || !detail.ok) {
    return {
      ok: false,
      message: `odourDescriptor and surface are at most ${MAX_SHORT_TEXT} characters; detail is at most ${MAX_DETAIL}`,
    };
  }

  let odourIntensity: number | null = null;
  if (body.odourIntensity !== undefined && body.odourIntensity !== null) {
    const n = body.odourIntensity;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 3) {
      return {
        ok: false,
        message: "odourIntensity must be 1 (faint), 2 (moderate) or 3 (strong)",
      };
    }
    odourIntensity = n;
  }

  let odourPattern: RoomOdourPattern | null = null;
  if (body.odourPattern !== undefined && body.odourPattern !== null) {
    if (!ROOM_ODOUR_PATTERNS.includes(body.odourPattern as RoomOdourPattern)) {
      return {
        ok: false,
        message: `odourPattern must be one of: ${ROOM_ODOUR_PATTERNS.join(", ")}`,
      };
    }
    odourPattern = body.odourPattern as RoomOdourPattern;
  }

  let areaM2: number | null = null;
  if (body.areaM2 !== undefined && body.areaM2 !== null) {
    const a = body.areaM2;
    if (typeof a !== "number" || !Number.isFinite(a) || a < 0 || a > MAX_AREA_M2) {
      return {
        ok: false,
        message: `areaM2 must be a number from 0 to ${MAX_AREA_M2}`,
      };
    }
    areaM2 = a;
  }

  if (k !== "ODOUR") {
    if (descriptor.value || odourIntensity !== null || odourPattern) {
      return {
        ok: false,
        message: "Odour fields only apply to an ODOUR observation",
      };
    }
  }
  if (k !== "VISIBLE_GROWTH" && areaM2 !== null) {
    return {
      ok: false,
      message: "areaM2 only applies to a VISIBLE_GROWTH observation",
    };
  }
  if (k === "ODOUR" && surface.value) {
    return {
      ok: false,
      message: "surface applies to VISIBLE_GROWTH and STAINING, not ODOUR",
    };
  }
  if (k === "ODOUR" && !descriptor.value && odourIntensity === null && !odourPattern && !detail.value) {
    return {
      ok: false,
      message: "Record at least one of the smell, its intensity, whether it is constant or intermittent, or a detail",
    };
  }

  if (k === "STAINING" && !surface.value && !detail.value) {
    return {
      ok: false,
      message: "Record where the staining is (surface) or describe it (detail)",
    };
  }
  if (k === "VISIBLE_GROWTH" && !surface.value && !detail.value && areaM2 === null) {
    return {
      ok: false,
      message: "Record the surface, the visible area or a detail for the growth",
    };
  }

  let observedAt: Date | null = null;
  if (body.observedAt !== undefined && body.observedAt !== null) {
    if (typeof body.observedAt !== "string" || !ISO_DATE_TIME.test(body.observedAt)) {
      return {
        ok: false,
        message: "observedAt must be an ISO 8601 date-time with a time zone",
      };
    }
    const d = new Date(body.observedAt);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, message: "observedAt must be an ISO date-time" };
    }
    if (d.getTime() > Date.now() + 5 * 60 * 1000) {
      return { ok: false, message: "observedAt cannot be in the future" };
    }
    observedAt = d;
  }

  return {
    ok: true,
    data: {
      kind: k,
      basis: basisRaw as RoomObservationBasis,
      sketchRoomId,
      roomLabel: room.value,
      odourDescriptor: descriptor.value,
      odourIntensity,
      odourPattern,
      areaM2,
      surface: surface.value,
      detail: detail.value,
      observedAt,
    },
  };
}
