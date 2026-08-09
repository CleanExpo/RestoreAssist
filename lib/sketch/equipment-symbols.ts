/**
 * Restoration equipment symbols for floor-plan placement (magicplan / Encircle
 * Hydro drying-equipment pattern). Pure descriptors — Fabric materialises them.
 */

export const EQUIPMENT_KINDS = [
  "dehumidifier",
  "air_mover",
  "air_scrubber",
  "cavity_dryer",
] as const;

export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const EQUIPMENT_KIND_STYLES: Record<
  EquipmentKind,
  { label: string; short: string; fill: string; stroke: string }
> = {
  dehumidifier: {
    label: "Dehumidifier",
    short: "DH",
    fill: "#E8F4F8",
    stroke: "#1C2E47",
  },
  air_mover: {
    label: "Air mover",
    short: "AM",
    fill: "#F5F0E8",
    stroke: "#8A6B4E",
  },
  air_scrubber: {
    label: "Air scrubber",
    short: "AS",
    fill: "#EEF6EE",
    stroke: "#2F6B3A",
  },
  cavity_dryer: {
    label: "Cavity dryer",
    short: "CD",
    fill: "#F8F0E8",
    stroke: "#A65D2E",
  },
};

export function isEquipmentKind(v: unknown): v is EquipmentKind {
  return (
    typeof v === "string" &&
    (EQUIPMENT_KINDS as readonly string[]).includes(v)
  );
}

/** Default symbol diameter in metres (field-readable on 100 px/m plans). */
export const DEFAULT_EQUIPMENT_DIAMETER_M = 0.55;

export interface EquipmentSymbolDescriptor {
  kind: "equipment-symbol";
  props: {
    left: number;
    top: number;
    radius: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
    label: string;
    short: string;
  };
  data: {
    type: "equipment";
    equipmentKind: EquipmentKind;
    provenance: "operator_measured";
    id: string;
  };
}

export function describeEquipmentSymbol(input: {
  x: number;
  y: number;
  equipmentKind: EquipmentKind;
  pxPerMetre?: number;
  diameterM?: number;
  id?: string;
}): EquipmentSymbolDescriptor {
  const style = EQUIPMENT_KIND_STYLES[input.equipmentKind];
  const scale = input.pxPerMetre || 100;
  const diameterM = input.diameterM ?? DEFAULT_EQUIPMENT_DIAMETER_M;
  const radius = (Math.max(0.2, diameterM) * scale) / 2;
  const id =
    input.id ??
    `equip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    kind: "equipment-symbol",
    props: {
      left: input.x,
      top: input.y,
      radius,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: 2,
      label: style.label,
      short: style.short,
    },
    data: {
      type: "equipment",
      equipmentKind: input.equipmentKind,
      provenance: "operator_measured",
      id,
    },
  };
}

export interface EquipmentLegendEntry {
  kind: EquipmentKind;
  label: string;
  short: string;
  swatch: string;
}

/**
 * Unique equipment kinds present in a Fabric JSON blob, in EQUIPMENT_KINDS order.
 */
export function extractEquipmentLegend(
  fabricJson: Record<string, unknown> | null | undefined,
): EquipmentLegendEntry[] {
  const objects = fabricJson?.objects;
  if (!Array.isArray(objects)) return [];
  const seen = new Set<EquipmentKind>();
  for (const o of objects) {
    const data = (o as { data?: { type?: string; equipmentKind?: unknown } })
      ?.data;
    if (data?.type !== "equipment") continue;
    if (isEquipmentKind(data.equipmentKind)) seen.add(data.equipmentKind);
  }
  return EQUIPMENT_KINDS.filter((k) => seen.has(k)).map((kind) => ({
    kind,
    label: EQUIPMENT_KIND_STYLES[kind].label,
    short: EQUIPMENT_KIND_STYLES[kind].short,
    swatch: EQUIPMENT_KIND_STYLES[kind].stroke,
  }));
}
