/**
 * RA-8388 Fault B: Guided Capture wrote an `EvidenceItem` and nothing else,
 * while the completion gate counts `MoistureReading`, `EnvironmentalData` and
 * `InspectionPhoto`. A technician could capture every required item, watch
 * each one appear in the evidence list, and still be told the job had
 * outstanding issues it could not name. There were two stores and only one
 * was ever written.
 *
 * This module derives the authoritative row from the SAME values the evidence
 * record was signed over, so the two halves cannot disagree about what was
 * recorded. The route writes both inside one transaction: a partial failure
 * must not leave a reading with no evidence record, or an evidence record
 * claiming a reading that the completion gate cannot see.
 *
 * Nothing here invents a value. `MoistureReading.surfaceType` and `.depth` are
 * required columns, and a guessed surface type in an insurance record is worse
 * than a refused capture - so a submission that cannot produce a complete row
 * is REFUSED with the missing field named, never written with a filler.
 */

import {
  METADATA_FIELDS,
  normaliseMetadataValues,
  type MetadataValues,
} from "./metadata-fields";

export type AuthoritativeTable =
  | "moistureReading"
  | "environmentalData"
  | "inspectionPhoto";

export interface AuthoritativeRowPlan {
  table: AuthoritativeTable;
  data: Record<string, unknown>;
}

/**
 * The metadata classes the completion gate counts through a table of their
 * own. Adding a class here makes its required fields binding on the server,
 * so it is a deliberate list rather than a derivation from METADATA_FIELDS.
 */
const CLASSES_WITH_A_ROW = new Set([
  "MOISTURE_READING",
  "AMBIENT_ENVIRONMENTAL",
]);

export type DeriveResult =
  | { ok: true; plan: AuthoritativeRowPlan | null }
  | { ok: false; missing: string[]; message: string };

export interface DeriveContext {
  inspectionId: string;
  /** From the signed manifest, so the row carries the signed capture time. */
  capturedAt: Date;
  notes: string | null;
}

/**
 * Read the structured payload back into field values.
 *
 * The payload holds numbers as numbers; the field contract is expressed in
 * strings, so this converts once, here, rather than at each call site.
 */
function valuesFromStructuredData(
  evidenceClass: string,
  structuredData: unknown,
): MetadataValues {
  const fields = METADATA_FIELDS[evidenceClass] ?? [];
  const source =
    structuredData && typeof structuredData === "object"
      ? (structuredData as Record<string, unknown>)
      : {};
  const values: MetadataValues = {};
  for (const field of fields) {
    const raw = source[field.key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) continue;
      values[field.key] = String(raw);
    } else if (typeof raw === "string") {
      values[field.key] = raw;
    }
  }
  return normaliseMetadataValues(evidenceClass, values);
}

function missingRequired(
  evidenceClass: string,
  values: MetadataValues,
): string[] {
  return (METADATA_FIELDS[evidenceClass] ?? [])
    .filter((f) => f.required && !values[f.key])
    .map((f) => f.label);
}

/**
 * Plan the authoritative row for one metadata submission.
 *
 * Returns `{ ok: true, plan: null }` for a class that legitimately has no
 * authoritative table - a technician note and an equipment log are evidence
 * records and nothing more. That is NOT the same as a failure, and keeping
 * them distinct is what stops a future class being silently dropped because
 * "it returned nothing".
 */
export function deriveAuthoritativeRow(
  evidenceClass: string,
  structuredData: unknown,
  ctx: DeriveContext,
): DeriveResult {
  if (!METADATA_FIELDS[evidenceClass]) {
    return { ok: true, plan: null };
  }

  // Completeness is enforced ONLY for the classes that must produce a row.
  // A technician note and an equipment log write no authoritative row, so
  // there is nothing the server is unable to store - and newly refusing a
  // submission shape the server could always accept would strand whatever is
  // sitting in an offline queue. The capture form still asks for these
  // fields; the server refuses only what it genuinely cannot write.
  if (!CLASSES_WITH_A_ROW.has(evidenceClass)) {
    return { ok: true, plan: null };
  }

  const values = valuesFromStructuredData(evidenceClass, structuredData);
  const missing = missingRequired(evidenceClass, values);
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message:
        missing.length === 1
          ? `${missing[0]} is required and was not supplied, so this was not saved.`
          : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]} are required and were not supplied, so this was not saved.`,
    };
  }

  switch (evidenceClass) {
    case "MOISTURE_READING":
      return {
        ok: true,
        plan: {
          table: "moistureReading",
          data: {
            inspectionId: ctx.inspectionId,
            location: values.location,
            surfaceType: values.surfaceType,
            moistureLevel: Number(values.moistureLevel),
            depth: values.depth,
            unit: "PERCENT_MC",
            // The reading came from a person reading an instrument on site,
            // not from a meter integration. Saying so honestly matters when
            // the file is read back in a dispute.
            source: "manual",
            notes: values.notes ?? ctx.notes,
            recordedAt: ctx.capturedAt,
          },
        },
      };

    case "AMBIENT_ENVIRONMENTAL":
      return {
        ok: true,
        plan: {
          table: "environmentalData",
          data: {
            inspectionId: ctx.inspectionId,
            // Celsius. This is an Australian product and the capture screen
            // asks for Celsius; a column comment mentioning Fahrenheit does
            // not change what the technician typed.
            ambientTemperature: Number(values.ambientTemperature),
            humidityLevel: Number(values.humidityLevel),
            location: values.location,
            notes: values.notes ?? ctx.notes,
            recordedAt: ctx.capturedAt,
            timestamp: ctx.capturedAt,
          },
        },
      };

    // A note and an equipment log are evidence records in their own right and
    // have no authoritative table to mirror. Explicitly nothing, not an
    // oversight.
    case "TECHNICIAN_NOTE":
    case "EQUIPMENT_LOG":
      return { ok: true, plan: null };

    default:
      return { ok: true, plan: null };
  }
}

export interface PhotoRowInput {
  inspectionId: string;
  url: string;
  thumbnailUrl: string | null;
  description: string | null;
  location: string | null;
  capturedAt: Date;
  fileSize: number | null;
  mimeType: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

/**
 * The photo half of Fault B.
 *
 * Guided Capture uploaded the bytes and wrote an `EvidenceItem`, so a photo
 * "worked" from the technician's side while `validateSubmissionPayload`, which
 * counts `InspectionPhoto`, still saw none. Every photo already captured this
 * way is invisible to the completion gate, which is why a backfill belongs
 * with this change and not after it.
 */
export function photoRowPlan(input: PhotoRowInput): AuthoritativeRowPlan {
  return {
    table: "inspectionPhoto",
    data: {
      inspectionId: input.inspectionId,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl,
      description: input.description,
      location: input.location,
      timestamp: input.capturedAt,
      uploadedAt: new Date(),
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      gpsLatitude: input.gpsLatitude,
      gpsLongitude: input.gpsLongitude,
    },
  };
}
