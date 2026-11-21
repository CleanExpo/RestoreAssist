/**
 * RA-8498 (DRC S5) — the site visit record's rules, in one place.
 *
 * A SiteVisit is one attendance at the property (the first visit and every
 * re-attendance). This module owns:
 *   - which items must be recorded before a visit can be submitted
 *     (`evaluateVisitSubmission`),
 *   - what a visit update may carry (`parseVisitPatch`),
 *   - the labels the field screen and the API answer use.
 * Routes and the field panel call these; they never restate the rule.
 *
 * Pure: no database, no clock except the `now` a caller passes in.
 */

export const MET_ON_SITE_VALUES = ["OWNER", "TENANT", "CLIENT_SUPERVISOR", "NO_ONE"] as const;
export type MetOnSite = (typeof MET_ON_SITE_VALUES)[number];

/** DRC's list (RA-8485 fit/gap R20). A category, never a person's name. */
export const MET_ON_SITE_LABEL: Record<MetOnSite, string> = {
  OWNER: "Owner",
  TENANT: "Tenant",
  CLIENT_SUPERVISOR: "Client or supervisor",
  NO_ONE: "No one",
};

export const EQUIPMENT_OUTCOME_VALUES = ["NONE_ON_SITE", "ALL_LEFT", "SOME_REMOVED", "ALL_REMOVED"] as const;
export type EquipmentOutcome = (typeof EQUIPMENT_OUTCOME_VALUES)[number];

export const EQUIPMENT_OUTCOME_LABEL: Record<EquipmentOutcome, string> = {
  NONE_ON_SITE: "No equipment on site",
  ALL_LEFT: "All equipment left on site",
  SOME_REMOVED: "Some equipment removed",
  ALL_REMOVED: "All equipment removed",
};

export const EQUIPMENT_NOTE_MAX = 500;

/**
 * Job statuses on which no visit may be started, changed or submitted. A
 * submitted job still takes re-attendances (DRC step 9); a closed one is
 * reopened first.
 */
const VISIT_LOCKED_STATUSES = new Set(["COMPLETED", "CLOSED", "ARCHIVED"]);
export function isVisitLockedStatus(status: string): boolean {
  return VISIT_LOCKED_STATUSES.has(status);
}

/** How far ahead of the server clock an arrival may be (phone clocks drift). */
const ARRIVAL_FUTURE_SLACK_MS = 60 * 60 * 1000;

export type VisitField =
  | "arrivedAt"
  | "departedAt"
  | "metOnSite"
  | "frontPhotoId"
  | "equipmentOutcome"
  | "equipmentNote";

export const VISIT_FIELD_LABEL: Record<VisitField, string> = {
  arrivedAt: "Arrival time",
  departedAt: "Departure time",
  metOnSite: "Who was on site",
  frontPhotoId: "Front of property photo",
  equipmentOutcome: "Equipment",
  equipmentNote: "Which equipment was removed",
};

export interface VisitForGate {
  arrivedAt: Date | null;
  departedAt: Date | null;
  metOnSite: string | null;
  frontPhotoId: string | null;
  equipmentOutcome: string | null;
  equipmentNote: string | null;
}

export type MissingItem = { field: VisitField; label: string };
export type VisitGateResult = { ok: true } | { ok: false; missing: MissingItem[] };

const item = (field: VisitField, label = VISIT_FIELD_LABEL[field]): MissingItem => ({ field, label });

/**
 * The submit rule. `frontPhotoUsable` is the caller's answer to "is the linked
 * photo still a photo of this job that counts as evidence" (not deleted, not
 * rejected-only); the gate itself never reads the database.
 */
export function evaluateVisitSubmission(
  visit: VisitForGate,
  opts: { frontPhotoUsable: boolean },
): VisitGateResult {
  const missing: MissingItem[] = [];
  if (!visit.arrivedAt) missing.push(item("arrivedAt"));
  if (!visit.departedAt) missing.push(item("departedAt"));
  else if (visit.arrivedAt && visit.departedAt.getTime() <= visit.arrivedAt.getTime()) {
    missing.push(item("departedAt", "Departure time must be after arrival time"));
  }
  if (!visit.metOnSite) missing.push(item("metOnSite"));
  if (!visit.frontPhotoId || !opts.frontPhotoUsable) missing.push(item("frontPhotoId"));
  if (!visit.equipmentOutcome) missing.push(item("equipmentOutcome"));
  else if (visit.equipmentOutcome === "SOME_REMOVED" && !visit.equipmentNote?.trim()) {
    missing.push(item("equipmentNote"));
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/** Whole minutes on site, or null when it cannot be worked out. */
export function minutesOnSite(arrivedAt: Date | null, departedAt: Date | null): number | null {
  if (!arrivedAt || !departedAt) return null;
  const ms = departedAt.getTime() - arrivedAt.getTime();
  return ms > 0 ? Math.floor(ms / 60000) : null;
}

export interface VisitPatch {
  arrivedAt?: Date | null;
  departedAt?: Date | null;
  metOnSite?: MetOnSite | null;
  frontPhotoId?: string | null;
  equipmentOutcome?: EquipmentOutcome | null;
  equipmentNote?: string | null;
}

export type ParseResult = { ok: true; data: VisitPatch } | { ok: false; error: string };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const ALLOWED = new Set<string>([
  "arrivedAt",
  "departedAt",
  "metOnSite",
  "frontPhotoId",
  "equipmentOutcome",
  "equipmentNote",
]);

function parseInstant(v: unknown): Date | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string" || !ISO_INSTANT.test(v)) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Validate a visit update body. Only the six visit fields may appear; anything
 * else (visitNumber, submittedAt, ids) is refused rather than ignored, so a
 * client cannot believe it set something it did not. `null` clears a field.
 */
export function parseVisitPatch(body: unknown, now: Date): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const src = body as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    if (!ALLOWED.has(k)) return { ok: false, error: `Unknown field: ${k}` };
  }
  const data: VisitPatch = {};

  for (const k of ["arrivedAt", "departedAt"] as const) {
    if (!(k in src)) continue;
    const d = parseInstant(src[k]);
    if (d === undefined) return { ok: false, error: `${k} must be an ISO 8601 date and time, or null` };
    data[k] = d;
  }
  if (data.arrivedAt && data.arrivedAt.getTime() > now.getTime() + ARRIVAL_FUTURE_SLACK_MS) {
    return { ok: false, error: "Arrival time cannot be in the future" };
  }
  if (data.arrivedAt && data.departedAt && data.departedAt.getTime() <= data.arrivedAt.getTime()) {
    return { ok: false, error: "Departure time must be after arrival time" };
  }

  if ("metOnSite" in src) {
    const v = src.metOnSite;
    if (v !== null && !(MET_ON_SITE_VALUES as readonly unknown[]).includes(v)) {
      return { ok: false, error: "metOnSite is not a recognised value" };
    }
    data.metOnSite = v as MetOnSite | null;
  }
  if ("equipmentOutcome" in src) {
    const v = src.equipmentOutcome;
    if (v !== null && !(EQUIPMENT_OUTCOME_VALUES as readonly unknown[]).includes(v)) {
      return { ok: false, error: "equipmentOutcome is not a recognised value" };
    }
    data.equipmentOutcome = v as EquipmentOutcome | null;
  }
  if ("frontPhotoId" in src) {
    const v = src.frontPhotoId;
    if (v !== null && (typeof v !== "string" || v.trim() === "" || v.length > 64)) {
      return { ok: false, error: "frontPhotoId must be a photo id or null" };
    }
    data.frontPhotoId = v === null ? null : v.trim();
  }
  if ("equipmentNote" in src) {
    const v = src.equipmentNote;
    if (v !== null && typeof v !== "string") return { ok: false, error: "equipmentNote must be text or null" };
    const trimmed = v === null ? null : v.trim();
    if (trimmed !== null && trimmed.length > EQUIPMENT_NOTE_MAX) {
      return { ok: false, error: `equipmentNote is longer than ${EQUIPMENT_NOTE_MAX} characters` };
    }
    data.equipmentNote = trimmed === "" ? null : trimmed;
  }
  return { ok: true, data };
}
