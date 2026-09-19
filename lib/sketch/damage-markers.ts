/**
 * IICRC-compliant damage marker library (RA-2953 / Floor Plan 6/8).
 *
 * Selectable overlay markers — not Fabric strokes and not the dead
 * `apps/mobile/src/floorPlan/damageMarkers/` path. Live surface is the web
 * Sketch editor (RA-7542 / RA-7547): React overlay + overlayVpt, same class as
 * evidence pins.
 *
 * Each marker: type, severity, room_label, optional dimension_m2, notes.
 * Citations come from `standardCite()` so edition years cannot drift.
 */

import { standardCite } from "@/lib/nir-standards-mapping";
import { toNormalized } from "@/lib/sketch/pin-coords";

export const DAMAGE_MARKER_TYPES = [
  "water_cat1",
  "water_cat2",
  "water_cat3",
  "fire",
  "smoke",
  "mould",
  "structural",
] as const;

export type DamageMarkerType = (typeof DAMAGE_MARKER_TYPES)[number];

export const DAMAGE_MARKER_SEVERITIES = [
  "low",
  "moderate",
  "high",
  "severe",
] as const;

export type DamageMarkerSeverity = (typeof DAMAGE_MARKER_SEVERITIES)[number];

export interface DamageMarker {
  id: string;
  type: DamageMarkerType;
  severity: DamageMarkerSeverity;
  room_label: string;
  dimension_m2?: number;
  notes?: string;
  /** Scene-space canvas pixels (legacy / hit-testing). */
  x: number;
  y: number;
  /** Normalized 0..1 — stable under resize; overlayVpt maps scene → screen. */
  nx?: number;
  ny?: number;
}

export interface DamageMarkerLibraryEntry {
  type: DamageMarkerType;
  label: string;
  short: string;
  group: "water" | "fire_smoke" | "mould" | "structural";
  /** IICRC short citation from the standards registry. */
  citation: string;
  description: string;
  /** Fill used on the overlay pin and the report swatch. */
  fill: string;
  stroke: string;
  /** 24×24 SVG path (viewBox 0 0 24 24). */
  iconPath: string;
}

/** Colour-coded severity ring — darker = higher extent / load. */
export const DAMAGE_MARKER_SEVERITY_STYLES: Record<
  DamageMarkerSeverity,
  { label: string; ring: string; scale: number }
> = {
  low: { label: "Low", ring: "#94A3B8", scale: 0.9 },
  moderate: { label: "Moderate", ring: "#E2E8F0", scale: 1 },
  high: { label: "High", ring: "#F59E0B", scale: 1.08 },
  severe: { label: "Severe", ring: "#DC2626", scale: 1.16 },
};

/**
 * Library SSOT. Water cats are S500 contamination categories (not evaporation
 * class). Mould is S520 condition symbology. Fire/smoke follow S700 residue
 * types. Structural is site-observed — no invented IICRC clause.
 */
export const DAMAGE_MARKER_LIBRARY: readonly DamageMarkerLibraryEntry[] = [
  {
    type: "water_cat1",
    label: "Water Cat 1",
    short: "C1",
    group: "water",
    citation: standardCite("S500", "10.4.1"),
    description: "Clean / potable water — sanitary source at first contact",
    fill: "#2563EB",
    stroke: "#1D4ED8",
    iconPath:
      "M12 2.2s-6.2 7.4-6.2 11.3A6.2 6.2 0 0 0 12 19.7a6.2 6.2 0 0 0 6.2-6.2C18.2 9.6 12 2.2 12 2.2z",
  },
  {
    type: "water_cat2",
    label: "Water Cat 2",
    short: "C2",
    group: "water",
    citation: standardCite("S500", "10.4.1"),
    description: "Grey water — significant contamination, sanitisation required",
    fill: "#D97706",
    stroke: "#B45309",
    iconPath:
      "M12 2.2s-6.2 7.4-6.2 11.3A6.2 6.2 0 0 0 12 19.7a6.2 6.2 0 0 0 6.2-6.2C18.2 9.6 12 2.2 12 2.2z",
  },
  {
    type: "water_cat3",
    label: "Water Cat 3",
    short: "C3",
    group: "water",
    citation: standardCite("S500", "10.4.1"),
    description: "Black water — grossly contaminated; containment and PPE",
    fill: "#B91C1C",
    stroke: "#7F1D1D",
    iconPath:
      "M12 2.2s-6.2 7.4-6.2 11.3A6.2 6.2 0 0 0 12 19.7a6.2 6.2 0 0 0 6.2-6.2C18.2 9.6 12 2.2 12 2.2z",
  },
  {
    type: "fire",
    label: "Fire",
    short: "F",
    group: "fire_smoke",
    citation: standardCite("S700", "6"),
    description: "Fire-affected structure or contents",
    fill: "#DC2626",
    stroke: "#991B1B",
    iconPath:
      "M12 2.5s2.4 3.4 2.4 6.2c0 1.4-.6 2.5-1.5 3.2.9-.2 2.1-1 2.8-2.4.4 1.3.3 3.2-.8 4.8-1.2 1.8-3.1 2.7-4.9 2.7-2.8 0-5-2.2-5-5.1C5 8.2 8.2 5.2 12 2.5z",
  },
  {
    type: "smoke",
    label: "Smoke",
    short: "Sm",
    group: "fire_smoke",
    citation: standardCite("S700", "6"),
    description: "Smoke / soot residue (dry, wet, protein, or fuel-oil)",
    fill: "#4B5563",
    stroke: "#1F2937",
    iconPath:
      "M4 16c1.6-1.4 3.2-1.4 4.8 0 1.6 1.4 3.2 1.4 4.8 0 1.6-1.4 3.2-1.4 4.8 0M4 12c1.6-1.4 3.2-1.4 4.8 0 1.6 1.4 3.2 1.4 4.8 0 1.6-1.4 3.2-1.4 4.8 0M4 8c1.6-1.4 3.2-1.4 4.8 0 1.6 1.4 3.2 1.4 4.8 0 1.6-1.4 3.2-1.4 4.8 0",
  },
  {
    type: "mould",
    label: "Mould",
    short: "Mo",
    group: "mould",
    citation: standardCite("S520", "6"),
    description: "Fungal ecology / visible growth (Condition 1–3)",
    fill: "#16A34A",
    stroke: "#166534",
    iconPath:
      "M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 1a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM7 17a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8zm6.5-1.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM16.5 18a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z",
  },
  {
    type: "structural",
    label: "Structural",
    short: "St",
    group: "structural",
    citation: standardCite("S500"),
    description: "Structural compromise observed on the plan (site-noted)",
    fill: "#7C3AED",
    stroke: "#5B21B6",
    iconPath: "M12 3.2 3.6 19.5h16.8L12 3.2zm0 5.4 4.6 8.7H7.4L12 8.6z",
  },
];

const LIBRARY_BY_TYPE: Record<DamageMarkerType, DamageMarkerLibraryEntry> =
  Object.fromEntries(DAMAGE_MARKER_LIBRARY.map((e) => [e.type, e])) as Record<
    DamageMarkerType,
    DamageMarkerLibraryEntry
  >;

export function isDamageMarkerType(v: unknown): v is DamageMarkerType {
  return (
    typeof v === "string" &&
    (DAMAGE_MARKER_TYPES as readonly string[]).includes(v)
  );
}

export function isDamageMarkerSeverity(v: unknown): v is DamageMarkerSeverity {
  return (
    typeof v === "string" &&
    (DAMAGE_MARKER_SEVERITIES as readonly string[]).includes(v)
  );
}

export function getDamageMarkerEntry(
  type: DamageMarkerType,
): DamageMarkerLibraryEntry {
  return LIBRARY_BY_TYPE[type];
}

export function damageMarkerFill(
  type: DamageMarkerType,
  severity: DamageMarkerSeverity = "moderate",
): string {
  const entry = LIBRARY_BY_TYPE[type];
  if (severity === "low") return lightenHex(entry.fill, 0.28);
  if (severity === "high") return darkenHex(entry.fill, 0.12);
  if (severity === "severe") return darkenHex(entry.fill, 0.22);
  return entry.fill;
}

export function damageMarkerAriaLabel(marker: DamageMarker): string {
  const entry = LIBRARY_BY_TYPE[marker.type];
  const bits = [entry.label, DAMAGE_MARKER_SEVERITY_STYLES[marker.severity].label];
  if (marker.room_label.trim()) bits.push(marker.room_label.trim());
  if (typeof marker.dimension_m2 === "number") {
    bits.push(`${marker.dimension_m2} m²`);
  }
  if (marker.notes?.trim()) bits.push(marker.notes.trim());
  return bits.join(" — ");
}

export function damageMarkerCaption(marker: DamageMarker): string {
  const entry = LIBRARY_BY_TYPE[marker.type];
  const room = marker.room_label.trim();
  if (room) return `${entry.short} ${room}`;
  return entry.label;
}

let markerCounter = 0;
export function newDamageMarkerId(): string {
  return `dm-${Date.now()}-${++markerCounter}`;
}

export function createDamageMarker(input: {
  type: DamageMarkerType;
  severity?: DamageMarkerSeverity;
  room_label?: string;
  dimension_m2?: number;
  notes?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): DamageMarker {
  const { nx, ny } = toNormalized(input.x, input.y, input.width, input.height);
  return {
    id: newDamageMarkerId(),
    type: input.type,
    severity: input.severity ?? "moderate",
    room_label: input.room_label?.trim() ?? "",
    ...(typeof input.dimension_m2 === "number" &&
    Number.isFinite(input.dimension_m2) &&
    input.dimension_m2 >= 0
      ? { dimension_m2: input.dimension_m2 }
      : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    x: input.x,
    y: input.y,
    nx,
    ny,
  };
}

export function parseDamageMarkers(raw: unknown): DamageMarker[] {
  if (!Array.isArray(raw)) return [];
  const out: DamageMarker[] = [];
  for (const value of raw) {
    const parsed = parseDamageMarker(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function parseDamageMarker(raw: unknown): DamageMarker | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!isDamageMarkerType(rec.type)) return null;
  if (!isDamageMarkerSeverity(rec.severity)) return null;
  if (typeof rec.x !== "number" || !Number.isFinite(rec.x)) return null;
  if (typeof rec.y !== "number" || !Number.isFinite(rec.y)) return null;
  const room =
    typeof rec.room_label === "string"
      ? rec.room_label
      : typeof rec.roomLabel === "string"
        ? rec.roomLabel
        : "";
  const nx =
    typeof rec.nx === "number" && rec.nx >= 0 && rec.nx <= 1 ? rec.nx : undefined;
  const ny =
    typeof rec.ny === "number" && rec.ny >= 0 && rec.ny <= 1 ? rec.ny : undefined;
  const dimension =
    typeof rec.dimension_m2 === "number" &&
    Number.isFinite(rec.dimension_m2) &&
    rec.dimension_m2 >= 0
      ? rec.dimension_m2
      : typeof rec.dimensionM2 === "number" &&
          Number.isFinite(rec.dimensionM2) &&
          rec.dimensionM2 >= 0
        ? rec.dimensionM2
        : undefined;
  const notes =
    typeof rec.notes === "string" && rec.notes.trim()
      ? rec.notes.trim()
      : undefined;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id : newDamageMarkerId();
  return {
    id,
    type: rec.type,
    severity: rec.severity,
    room_label: room,
    ...(dimension !== undefined ? { dimension_m2: dimension } : {}),
    ...(notes ? { notes } : {}),
    x: rec.x,
    y: rec.y,
    ...(nx !== undefined ? { nx } : {}),
    ...(ny !== undefined ? { ny } : {}),
  };
}

export interface DamageMarkerLegendEntry {
  type: DamageMarkerType;
  label: string;
  swatch: string;
  citation: string;
}

/** Unique types present, in library order — report legend. */
export function extractDamageMarkerLegend(
  markers: ReadonlyArray<DamageMarker> | null | undefined,
): DamageMarkerLegendEntry[] {
  if (!markers?.length) return [];
  const seen = new Set<DamageMarkerType>();
  for (const m of markers) seen.add(m.type);
  return DAMAGE_MARKER_TYPES.filter((t) => seen.has(t)).map((type) => {
    const entry = LIBRARY_BY_TYPE[type];
    return {
      type,
      label: entry.label,
      swatch: entry.fill,
      citation: entry.citation,
    };
  });
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((c) => Number.isNaN(c))) return null;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((c) => clampByte(c).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function lightenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(
    rgb.r + (255 - rgb.r) * amount,
    rgb.g + (255 - rgb.g) * amount,
    rgb.b + (255 - rgb.b) * amount,
  );
}

function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r * (1 - amount), rgb.g * (1 - amount), rgb.b * (1 - amount));
}
