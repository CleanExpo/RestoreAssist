/**
 * RA-8372 (RA-IEP-02) — source / pathway / receptor investigation view.
 *
 * View-only and derived. This module reads the evidence a floor already holds
 * (moisture pins, damage markers, evidence pins) and arranges it as an
 * investigation layer over the existing room sketch. It persists nothing and
 * owns no evidence: the existing stores stay the single owner (RA-7076).
 *
 * What it will not do:
 *   - invent a source or a pathway. No hypothesis store exists yet, so both
 *     are reported as "not recorded" until a technician can record them
 *     (schema proposal in the RA-8372 PR, founder-gated).
 *   - produce a microbial dose, clearance result, or health-risk statement.
 *   - call anything "safe". Unsupported condition wording in free text is
 *     flagged, never repeated as a finding.
 *
 * Every displayed value carries a basis:
 *   observed    — captured on site (an instrument reading, a photo, a marker
 *                 a technician placed);
 *   calculated  — derived by RestoreAssist from an observed value (e.g. the
 *                 moisture class derived from a WME reading);
 *   illustrated — drawn for orientation only, not measured. Nothing in this
 *                 slice is illustrated; the value exists so later slices
 *                 (layered assembly, pathway arrows) label honestly.
 */

import { pinPixelPosition } from "@/lib/sketch/pin-coords";
import {
  getDamageMarkerEntry,
  type DamageMarker,
} from "@/lib/sketch/damage-markers";

export type ValueBasis = "observed" | "calculated" | "illustrated";

export const VALUE_BASIS_LABEL: Record<ValueBasis, string> = {
  observed: "Observed",
  calculated: "Calculated",
  illustrated: "Illustrated",
};

/**
 * Pathway classes a later slice may let a technician record. Listed here so
 * the vocabulary is fixed before any data is captured; nothing in this slice
 * emits a pathway.
 */
export const SUPPORTED_PATHWAY_KINDS = [
  "liquid",
  "vapour",
  "air",
  "heat",
  "particle",
] as const;
export type PathwayKind = (typeof SUPPORTED_PATHWAY_KINDS)[number];

export type SketchViewMode = "plan" | "investigation";

export function isSketchViewMode(v: unknown): v is SketchViewMode {
  return v === "plan" || v === "investigation";
}

export type ObservationKind =
  | "instrument_reading"
  | "photo"
  | "technician_marker";

export interface InvestigationValue {
  label: string;
  value: string;
  basis: ValueBasis;
}

export interface InvestigationObservation {
  /** Stable id: `<kind>:<source id>` — binds back to the owning record. */
  id: string;
  sourceRecordId: string;
  kind: ObservationKind;
  title: string;
  roomLabel: string;
  /** Scene-space pixels; the layer maps them through the overlay viewport. */
  sceneX: number;
  sceneY: number;
  values: InvestigationValue[];
  /** Facts the record does not carry, stated plainly. */
  gaps: string[];
  /** Free text that uses condition wording the record cannot support. */
  flaggedWording: string[];
}

export interface InvestigationOverlay {
  observations: InvestigationObservation[];
  /** Receptor = where an effect was observed. Rooms only, never people. */
  receptors: { roomLabel: string; observationIds: string[] }[];
  source: { status: "not_recorded"; note: string };
  pathways: { status: "not_recorded"; note: string };
  /** True when the floor carries no mould observation of any kind. */
  waterOnly: boolean;
  gapCount: number;
}

export interface MoisturePinInput {
  id: string;
  x: number;
  y: number;
  nx?: number;
  ny?: number;
  wme: number;
  material: string;
  note?: string;
  iicrClass: number;
}

export interface EvidencePinInput {
  id: string;
  kind: string;
  x: number;
  y: number;
  nx?: number | null;
  ny?: number | null;
  roomName?: string | null;
  caption?: string | null;
  inspectionPhotoId?: string | null;
}

export interface BuildInvestigationOverlayInput {
  moisturePins: readonly MoisturePinInput[];
  damageMarkers: readonly DamageMarker[];
  evidencePins: readonly EvidencePinInput[];
  width: number;
  height: number;
  /** Room containing a scene point, or "" when it sits outside every room. */
  resolveRoomLabel?: (x: number, y: number) => string;
}

export const UNASSIGNED_ROOM_LABEL = "Outside a drawn room";

/**
 * Condition wording an overlay built from site evidence cannot support.
 * A pin or a photo does not establish that an area is safe, clear, or free of
 * risk, and it carries no dose or exposure figure.
 */
const UNSUPPORTED_CONDITION_PATTERNS: readonly RegExp[] = [
  /\bsafe\b/i,
  /\bsafe to (re-?)?occupy\b/i,
  /\bcleared?\b/i,
  /\bclearance\b/i,
  /\bhealthy\b/i,
  /\bno (health )?risk\b/i,
  /\bhealth risk\b/i,
  /\brisk[- ]free\b/i,
  /\bmould[- ]free\b/i,
  /\bspore (dose|count)\b/i,
  /\bexposure dose\b/i,
];

export function findUnsupportedConditionWording(text: string): string[] {
  const hits: string[] = [];
  for (const re of UNSUPPORTED_CONDITION_PATTERNS) {
    const m = text.match(re);
    if (m && !hits.includes(m[0].toLowerCase())) hits.push(m[0].toLowerCase());
  }
  return hits;
}

/** Distance (scene px) within which a photo counts as covering a marker. */
export const PHOTO_COVERAGE_RADIUS_PX = 80;

function roomFor(
  resolve: BuildInvestigationOverlayInput["resolveRoomLabel"],
  x: number,
  y: number,
  fallback?: string | null,
): string {
  const named = (fallback ?? "").trim();
  if (named) return named;
  const resolved = (resolve?.(x, y) ?? "").trim();
  return resolved || UNASSIGNED_ROOM_LABEL;
}

function scenePos(
  pin: { x: number; y: number; nx?: number | null; ny?: number | null },
  width: number,
  height: number,
): { x: number; y: number } {
  const p = pinPixelPosition(
    {
      x: pin.x,
      y: pin.y,
      nx: pin.nx ?? undefined,
      ny: pin.ny ?? undefined,
    },
    width,
    height,
  );
  return { x: p.left, y: p.top };
}

function flag(text: string | null | undefined): string[] {
  return text ? findUnsupportedConditionWording(text) : [];
}

export function buildInvestigationOverlay(
  input: BuildInvestigationOverlayInput,
): InvestigationOverlay {
  const { width, height, resolveRoomLabel } = input;
  const observations: InvestigationObservation[] = [];

  const photos = input.evidencePins
    .filter((p) => p.kind === "photo")
    .map((p) => ({ pin: p, pos: scenePos(p, width, height) }));

  for (const pin of input.moisturePins) {
    if (!Number.isFinite(pin.wme)) continue;
    const pos = scenePos(pin, width, height);
    observations.push({
      id: `instrument_reading:${pin.id}`,
      sourceRecordId: pin.id,
      kind: "instrument_reading",
      title: "Moisture reading",
      roomLabel: roomFor(resolveRoomLabel, pos.x, pos.y),
      sceneX: pos.x,
      sceneY: pos.y,
      values: [
        { label: "WME", value: `${pin.wme} %`, basis: "observed" },
        { label: "Material", value: pin.material, basis: "observed" },
        {
          label: "Moisture class",
          value: `Class ${pin.iicrClass}`,
          basis: "calculated",
        },
      ],
      gaps: [
        "Instrument identity not recorded",
        "Calibration check not recorded",
        "Reading time not recorded on the pin",
      ],
      flaggedWording: flag(pin.note),
    });
  }

  for (const marker of input.damageMarkers) {
    const pos = scenePos(marker, width, height);
    const entry = getDamageMarkerEntry(marker.type);
    const values: InvestigationValue[] = [
      { label: "Type", value: entry.label, basis: "observed" },
      { label: "Severity", value: marker.severity, basis: "observed" },
    ];
    if (typeof marker.dimension_m2 === "number") {
      values.push({
        label: "Affected area",
        value: `${marker.dimension_m2} m²`,
        basis: "observed",
      });
    }
    const covered = photos.some(
      ({ pos: p }) =>
        Math.hypot(p.x - pos.x, p.y - pos.y) <= PHOTO_COVERAGE_RADIUS_PX,
    );
    observations.push({
      id: `technician_marker:${marker.id}`,
      sourceRecordId: marker.id,
      kind: "technician_marker",
      title: entry.label,
      roomLabel: roomFor(resolveRoomLabel, pos.x, pos.y, marker.room_label),
      sceneX: pos.x,
      sceneY: pos.y,
      values,
      gaps: covered ? [] : ["No photo pinned near this marker"],
      flaggedWording: flag(marker.notes),
    });
  }

  for (const { pin, pos } of photos) {
    observations.push({
      id: `photo:${pin.id}`,
      sourceRecordId: pin.id,
      kind: "photo",
      title: "Photo",
      roomLabel: roomFor(resolveRoomLabel, pos.x, pos.y, pin.roomName),
      sceneX: pos.x,
      sceneY: pos.y,
      values: pin.caption
        ? [{ label: "Caption", value: pin.caption, basis: "observed" }]
        : [],
      gaps: pin.caption ? [] : ["No caption"],
      flaggedWording: flag(pin.caption),
    });
  }

  const byRoom = new Map<string, string[]>();
  for (const o of observations) {
    if (o.kind === "photo") continue;
    const list = byRoom.get(o.roomLabel) ?? [];
    list.push(o.id);
    byRoom.set(o.roomLabel, list);
  }

  return {
    observations,
    receptors: [...byRoom.entries()].map(([roomLabel, observationIds]) => ({
      roomLabel,
      observationIds,
    })),
    source: {
      status: "not_recorded",
      note: "No source hypothesis recorded for this floor.",
    },
    pathways: {
      status: "not_recorded",
      note: "No pathway recorded. Pathways are not inferred from pin positions.",
    },
    waterOnly: !input.damageMarkers.some((m) => m.type === "mould"),
    gapCount: observations.reduce((n, o) => n + o.gaps.length, 0),
  };
}
