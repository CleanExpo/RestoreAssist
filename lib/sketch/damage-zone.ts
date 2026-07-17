/**
 * Structured damage zones on the sketch canvas.
 * Freehand/brush paths stamp data.type = "damage" + damageKind for export/legend.
 */

export const DAMAGE_KINDS = [
  "water",
  "fire",
  "mould",
  "smoke",
  "biohazard",
  "structural",
  "electrical",
  "contents",
] as const;

export type DamageKind = (typeof DAMAGE_KINDS)[number];

export const DAMAGE_KIND_STYLES: Record<
  DamageKind,
  { stroke: string; fill: string; label: string }
> = {
  water: {
    stroke: "rgba(37, 99, 235, 0.85)",
    fill: "rgba(37, 99, 235, 0.22)",
    label: "Water",
  },
  fire: {
    stroke: "rgba(220, 38, 38, 0.85)",
    fill: "rgba(220, 38, 38, 0.22)",
    label: "Fire",
  },
  mould: {
    stroke: "rgba(22, 163, 74, 0.85)",
    fill: "rgba(22, 163, 74, 0.22)",
    label: "Mould",
  },
  smoke: {
    stroke: "rgba(75, 85, 99, 0.85)",
    fill: "rgba(75, 85, 99, 0.28)",
    label: "Smoke",
  },
  biohazard: {
    stroke: "rgba(202, 138, 4, 0.9)",
    fill: "rgba(202, 138, 4, 0.25)",
    label: "Biohazard",
  },
  structural: {
    stroke: "rgba(124, 58, 237, 0.85)",
    fill: "rgba(124, 58, 237, 0.22)",
    label: "Structural",
  },
  electrical: {
    stroke: "rgba(234, 179, 8, 0.9)",
    fill: "rgba(234, 179, 8, 0.25)",
    label: "Electrical",
  },
  contents: {
    stroke: "rgba(14, 165, 233, 0.85)",
    fill: "rgba(14, 165, 233, 0.2)",
    label: "Contents",
  },
};

export function isDamageKind(v: unknown): v is DamageKind {
  return typeof v === "string" && (DAMAGE_KINDS as readonly string[]).includes(v);
}
