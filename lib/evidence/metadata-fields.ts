/**
 * RA-8388: the field contract for metadata-only evidence.
 *
 * ONE declaration per evidence class, read by three things that previously
 * each held their own idea of what a reading contains:
 *
 *   1. the capture form, which renders these fields;
 *   2. `buildMetadataStructuredData`, which turns the entered values into the
 *      signed payload;
 *   3. `lib/evidence/authoritative-rows.ts`, which turns the same values into
 *      the MoistureReading / EnvironmentalData row the completion gate counts.
 *
 * That is deliberate. The capture screen used to ask a technician for one
 * number labelled "RH" while `EnvironmentalData` requires BOTH an ambient
 * temperature and a humidity level, and `MoistureReading` requires a surface
 * type and a depth that nothing ever asked for. A form and a table that
 * disagree about what a reading is cannot be fixed by being careful in two
 * places; they have to read the same declaration.
 *
 * Australian English and metric units throughout: this is an Australian
 * restoration product and a technician reads these labels on a wet site.
 */

export type MetadataFieldKind = "text" | "number" | "select" | "textarea";

export interface MetadataFieldOption {
  value: string;
  label: string;
}

export interface MetadataField {
  key: string;
  label: string;
  kind: MetadataFieldKind;
  required: boolean;
  /** Shown after the input, e.g. "%" or "C". Display only. */
  unit?: string;
  options?: MetadataFieldOption[];
  placeholder?: string;
  /** One short line under the field. Not a tooltip - wet gloves, small screen. */
  help?: string;
  min?: number;
  max?: number;
}

/**
 * Surface types a restoration technician actually meets in an Australian
 * building. "Plasterboard", not "drywall".
 */
const SURFACE_TYPES: MetadataFieldOption[] = [
  { value: "Plasterboard", label: "Plasterboard" },
  { value: "Timber", label: "Timber" },
  { value: "Timber flooring", label: "Timber flooring" },
  { value: "Carpet", label: "Carpet" },
  { value: "Carpet underlay", label: "Carpet underlay" },
  { value: "Concrete", label: "Concrete slab" },
  { value: "Tile", label: "Tile" },
  { value: "Insulation", label: "Insulation" },
  { value: "Brick", label: "Brick" },
  { value: "Cabinetry", label: "Cabinetry" },
  { value: "Other", label: "Other" },
];

const DEPTHS: MetadataFieldOption[] = [
  { value: "Surface", label: "Surface" },
  { value: "Subsurface", label: "Subsurface" },
];

const EQUIPMENT_ACTIONS: MetadataFieldOption[] = [
  { value: "Deployed", label: "Deployed" },
  { value: "Checked", label: "Checked" },
  { value: "Relocated", label: "Relocated" },
  { value: "Removed", label: "Removed" },
];

export const METADATA_FIELDS: Record<string, MetadataField[]> = {
  TECHNICIAN_NOTE: [
    {
      key: "note",
      label: "Note",
      kind: "textarea",
      required: true,
      placeholder:
        "Triage notes, what you found on arrival, anything the next person needs to know",
      help: "Free text. This is the note the claim file carries.",
    },
    {
      key: "location",
      label: "Location",
      kind: "text",
      required: false,
      placeholder: "Living room, hallway, whole property",
    },
  ],

  MOISTURE_READING: [
    {
      key: "location",
      label: "Location",
      kind: "text",
      required: true,
      placeholder: "Living room south wall",
      help: "Where this reading was taken. Be specific enough to find again.",
    },
    {
      key: "surfaceType",
      label: "Material",
      kind: "select",
      required: true,
      options: SURFACE_TYPES,
    },
    {
      key: "moistureLevel",
      label: "Reading",
      kind: "number",
      required: true,
      unit: "%",
      min: 0,
      max: 100,
    },
    {
      key: "depth",
      label: "Depth",
      kind: "select",
      required: true,
      options: DEPTHS,
    },
    {
      key: "notes",
      label: "Notes",
      kind: "textarea",
      required: false,
      placeholder: "Anything unusual about this reading",
    },
  ],

  AMBIENT_ENVIRONMENTAL: [
    {
      key: "location",
      label: "Location",
      kind: "text",
      required: true,
      placeholder: "Hallway, affected room, outside",
      help: "Unaffected and outside readings matter as much as affected ones.",
    },
    {
      key: "ambientTemperature",
      label: "Temperature",
      kind: "number",
      required: true,
      unit: "C",
      min: -20,
      max: 70,
    },
    {
      key: "humidityLevel",
      label: "Relative humidity",
      kind: "number",
      required: true,
      unit: "%",
      min: 0,
      max: 100,
      // The whole reason this class existed and could not be completed: the
      // screen asked for one number and called it RH.
      help: "Temperature and humidity are both required; one without the other proves nothing.",
    },
    {
      key: "notes",
      label: "Notes",
      kind: "textarea",
      required: false,
    },
  ],

  EQUIPMENT_LOG: [
    {
      key: "equipment",
      label: "Equipment",
      kind: "text",
      required: true,
      placeholder: "LGR dehumidifier, air mover, AFD",
    },
    {
      key: "action",
      label: "Action",
      kind: "select",
      required: true,
      options: EQUIPMENT_ACTIONS,
    },
    {
      key: "location",
      label: "Location",
      kind: "text",
      required: true,
      placeholder: "Living room",
    },
    {
      key: "quantity",
      label: "Quantity",
      kind: "number",
      required: false,
      min: 1,
      max: 99,
    },
    {
      key: "notes",
      label: "Notes",
      kind: "textarea",
      required: false,
    },
  ],
};

/** The four classes that carry no bytes and are captured as fields, not photos. */
export const METADATA_EVIDENCE_CLASSES = Object.keys(METADATA_FIELDS);

export function isMetadataEvidenceClass(evidenceClass: string): boolean {
  return Object.prototype.hasOwnProperty.call(METADATA_FIELDS, evidenceClass);
}

export type MetadataValues = Record<string, string>;

export interface MetadataValidationResult {
  ok: boolean;
  /** Field key to the message shown under that field. Empty when ok. */
  errors: Record<string, string>;
}

/**
 * Validate entered values against the declaration.
 *
 * Returns per-FIELD messages rather than one banner, because the screen this
 * replaces told a technician "nothing happens" and then discarded everything
 * they had typed. A refusal has to say which field and why, next to the field,
 * with the entry still on screen.
 */
export function validateMetadataValues(
  evidenceClass: string,
  values: MetadataValues,
): MetadataValidationResult {
  const fields = METADATA_FIELDS[evidenceClass];
  if (!fields) {
    return {
      ok: false,
      errors: { _form: `No field contract for ${evidenceClass}` },
    };
  }

  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? "").trim();

    if (!raw) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      continue;
    }

    if (field.kind === "number") {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        errors[field.key] = `${field.label} must be a number`;
        continue;
      }
      if (field.min !== undefined && value < field.min) {
        errors[field.key] =
          `${field.label} cannot be below ${field.min}${field.unit ?? ""}`;
        continue;
      }
      if (field.max !== undefined && value > field.max) {
        errors[field.key] =
          `${field.label} cannot be above ${field.max}${field.unit ?? ""}`;
      }
      continue;
    }

    if (field.kind === "select" && field.options) {
      if (!field.options.some((o) => o.value === raw)) {
        errors[field.key] = `Choose a ${field.label.toLowerCase()}`;
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** A trimmed copy with blank optional fields dropped, so the digest is stable. */
export function normaliseMetadataValues(
  evidenceClass: string,
  values: MetadataValues,
): MetadataValues {
  const fields = METADATA_FIELDS[evidenceClass] ?? [];
  const out: MetadataValues = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? "").trim();
    if (raw) out[field.key] = raw;
  }
  return out;
}

/**
 * The structured payload that travels inside the signed bytes.
 *
 * Numbers are stored as numbers, not as the strings the inputs produced, so
 * the authoritative row and the evidence record carry the same value and a
 * later reader never has to guess whether "18.40" and "18.4" are one reading.
 */
export function buildMetadataStructuredData(
  evidenceClass: string,
  values: MetadataValues,
): Record<string, unknown> | null {
  const fields = METADATA_FIELDS[evidenceClass];
  if (!fields) return null;
  const clean = normaliseMetadataValues(evidenceClass, values);

  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = clean[field.key];
    if (raw === undefined) continue;
    out[field.key] = field.kind === "number" ? Number(raw) : raw;
  }
  if (Object.keys(out).length === 0) return null;
  out.fieldContractVersion = METADATA_FIELD_CONTRACT_VERSION;
  return out;
}

/**
 * Bumped when the field set for any class changes shape, so a record written
 * today can still be read correctly after the contract evolves. It rides
 * inside the signed payload.
 */
export const METADATA_FIELD_CONTRACT_VERSION = 1 as const;

/** The one-line title shown in the evidence list and on the claim file. */
export function buildMetadataTitle(
  evidenceClass: string,
  values: MetadataValues,
): string {
  const v = normaliseMetadataValues(evidenceClass, values);
  switch (evidenceClass) {
    case "MOISTURE_READING":
      return [v.location, v.surfaceType && `(${v.surfaceType})`]
        .filter(Boolean)
        .join(" ")
        .trim();
    case "AMBIENT_ENVIRONMENTAL":
      return v.location ?? "Ambient reading";
    case "EQUIPMENT_LOG":
      return [v.equipment, v.action && `- ${v.action}`, v.location && `- ${v.location}`]
        .filter(Boolean)
        .join(" ")
        .trim();
    case "TECHNICIAN_NOTE": {
      const note = v.note ?? "";
      const firstLine = note.split("\n")[0].trim();
      return firstLine.length > 70
        ? `${firstLine.slice(0, 67).trimEnd()}...`
        : firstLine || "Technician note";
    }
    default:
      return evidenceClass;
  }
}

/** The human-readable body stored as the evidence record's description. */
export function buildMetadataNotes(
  evidenceClass: string,
  values: MetadataValues,
): string | null {
  const v = normaliseMetadataValues(evidenceClass, values);
  switch (evidenceClass) {
    case "MOISTURE_READING": {
      const parts = [
        v.moistureLevel !== undefined ? `${v.moistureLevel}%` : null,
        v.depth ? `${v.depth.toLowerCase()}` : null,
      ].filter(Boolean);
      const head = parts.length ? `Reading ${parts.join(", ")}` : null;
      return [head, v.notes].filter(Boolean).join(". ") || null;
    }
    case "AMBIENT_ENVIRONMENTAL": {
      const head =
        v.ambientTemperature !== undefined && v.humidityLevel !== undefined
          ? `${v.ambientTemperature}C, ${v.humidityLevel}% RH`
          : null;
      return [head, v.notes].filter(Boolean).join(". ") || null;
    }
    case "EQUIPMENT_LOG": {
      const head = v.quantity ? `Quantity ${v.quantity}` : null;
      return [head, v.notes].filter(Boolean).join(". ") || null;
    }
    case "TECHNICIAN_NOTE":
      return v.note ?? null;
    default:
      return v.notes ?? null;
  }
}
