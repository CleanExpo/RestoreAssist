/**
 * RA-7694: the "Room observations" section of the report PDF, built from the
 * RoomObservation rows. Pure, so it can be tested without a PDF.
 *
 * Interpretation guard (same doctrine as RA-7686 / RA-8540):
 * - Each line says what the record rests on: observed, measured or a
 *   hypothesis. A hypothesis is never printed as an observation.
 * - Nothing here names a species, diagnoses, or sets a condition or clearance.
 * - An empty record prints no section at all; it is never padded with "None".
 */

import { ODOUR_INTENSITY_LABEL } from "@/lib/observations/room-observations";
import { preserveOperators } from "@/lib/reports/mould-lab-results";

export interface ReportRoomObservation {
  roomLabel: string;
  kind: string;
  basis: string;
  odourDescriptor?: string | null;
  odourIntensity?: number | null;
  odourPattern?: string | null;
  areaM2?: number | null;
  surface?: string | null;
  detail?: string | null;
  observedAt?: Date | string | null;
}

export interface RoomObservationGroup {
  room: string;
  rows: Array<[string, string]>;
}

export const ROOM_OBSERVATIONS_NOTICE =
  "These entries record what the technician saw, smelt or measured in each room. They are not a diagnosis, do not identify a species, and do not set a condition or clearance. Where the cause is unclear, a qualified assessor assesses.";

const BASIS_TEXT: Record<string, string> = {
  OBSERVED: "Observed",
  MEASURED: "Measured",
  HYPOTHESISED: "Hypothesis, not confirmed",
};

const KIND_LABEL: Record<string, string> = {
  ODOUR: "Odour:",
  VISIBLE_GROWTH: "Visible growth:",
  STAINING: "Staining:",
};

function clean(v: string | null | undefined): string {
  return preserveOperators((v ?? "").trim());
}

function dateText(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

function valueText(o: ReportRoomObservation): string {
  const parts: string[] = [];
  if (o.kind === "ODOUR") {
    parts.push(clean(o.odourDescriptor) || "Odour noted");
    if (o.odourPattern === "INTERMITTENT") parts.push("intermittent");
    else if (o.odourPattern === "CONSTANT") parts.push("constant");
    if (typeof o.odourIntensity === "number") {
      const label = ODOUR_INTENSITY_LABEL[o.odourIntensity];
      if (label) parts.push(`intensity ${o.odourIntensity} of 3 (${label})`);
    }
  } else {
    const surface = clean(o.surface);
    if (surface) parts.push(`on ${surface}`);
    if (o.kind === "VISIBLE_GROWTH" && typeof o.areaM2 === "number") {
      parts.push(`about ${o.areaM2.toLocaleString("en-AU")} m2 visible`);
    }
  }
  const detail = clean(o.detail);
  if (detail) parts.push(detail);
  const basis = BASIS_TEXT[o.basis] ?? "Observed";
  const when = dateText(o.observedAt);
  return `${parts.join("; ")}. ${basis}${when ? `, ${when}` : ""}.`;
}

/** A bounded read must say what it left out. Null when nothing was omitted. */
export function roomObservationsOmittedNotice(
  omitted: number | null | undefined,
): string | null {
  return typeof omitted === "number" && omitted > 0
    ? `${omitted.toLocaleString("en-AU")} further recorded observation${omitted === 1 ? " is" : "s are"} not shown here.`
    : null;
}

/** Print only when at least one observation was recorded. */
export function shouldPrintRoomObservations(
  rows: ReadonlyArray<ReportRoomObservation> | null | undefined,
): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

/** Groups by room, keeping the order rooms were first recorded. */
export function roomObservationGroups(
  rows: ReadonlyArray<ReportRoomObservation> | null | undefined,
): RoomObservationGroup[] {
  const groups = new Map<string, RoomObservationGroup>();
  for (const o of rows ?? []) {
    const room = clean(o.roomLabel) || "Room not named";
    const key = room.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { room, rows: [] };
      groups.set(key, g);
    }
    g.rows.push([KIND_LABEL[o.kind] ?? "Observation:", valueText(o)]);
  }
  return [...groups.values()];
}
