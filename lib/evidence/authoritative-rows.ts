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

import type { Prisma } from "@prisma/client";

import {
  METADATA_FIELDS,
  normaliseMetadataValues,
  type MetadataValues,
} from "./metadata-fields";

/**
 * A planned row, typed against the REAL Prisma input for its table.
 *
 * This was `{ table: string; data: Record<string, unknown> }`, and the route
 * then wrote `data: plan.data as Prisma.MoistureReadingUncheckedCreateInput`.
 * A cast over an index signature checks nothing: a renamed column, a missing
 * required column or a wrong type all compiled clean and failed at runtime on
 * a technician's phone. The switch in the route now narrows this union to the
 * right input type with no cast at all, so `tsc` actually checks the columns
 * this module claims to write.
 */
export type AuthoritativeRowPlan =
  | {
      table: "moistureReading";
      data: Prisma.MoistureReadingUncheckedCreateInput;
    }
  | {
      table: "environmentalData";
      data: Prisma.EnvironmentalDataUncheckedCreateInput;
    }
  | {
      table: "inspectionPhoto";
      data: Prisma.InspectionPhotoUncheckedCreateInput;
    };

export type AuthoritativeTable = AuthoritativeRowPlan["table"];

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
            // `unit` is deliberately NOT set.
            //
            // It was `"PERCENT_MC"`, which is a claim about the instrument's
            // scale that nobody made. The capture form asks for "Reading" in
            // "%", and a pin meter reading 18% WME on timber and a meter
            // reading 18% moisture content are different measurements that
            // IICRC S500 treats differently. The column is nullable, and the
            // exporters already fall back to "%" when it is null, so leaving
            // it empty costs nothing and asserts nothing.
            //
            // Follow-up, not invented here: if the unit matters to the claim,
            // the field contract has to ASK for it, which changes the signed
            // payload and so belongs in its own change.
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

/**
 * The classes whose uploads are PHOTOGRAPHS of the property.
 *
 * `validateSubmissionPayload` counts `InspectionPhoto` rows to answer
 * "does this inspection have photographs", so writing a row for anything
 * else answers that question wrongly. A scanned authority form, a lab PDF
 * and a floor-plan sketch are all images by mime type and none of them is a
 * photograph of the damage; `VIDEO_WALKTHROUGH` travels this same multipart
 * branch and would otherwise be counted as a photo as well.
 *
 * Deliberately a list rather than a `startsWith("PHOTO_")` test: THERMAL_IMAGE
 * and AFFECTED_CONTENTS are photographs and do not carry the prefix, and a
 * future class should have to be added here on purpose.
 */
const PHOTO_EVIDENCE_CLASSES = new Set([
  "PHOTO_DAMAGE",
  "PHOTO_EQUIPMENT",
  "PHOTO_PROGRESS",
  "PHOTO_COMPLETION",
  "THERMAL_IMAGE",
  "AFFECTED_CONTENTS",
]);

/**
 * Whether this multipart upload should also write an `InspectionPhoto`.
 *
 * BOTH conditions, because each one alone is wrong: the class alone would
 * accept a PDF uploaded as PHOTO_DAMAGE, and the mime type alone would accept
 * a scanned AUTHORITY_FORM as a photograph of the property.
 */
export function shouldWritePhotoRow(
  evidenceClass: string,
  mimeType: string | null,
): boolean {
  if (!PHOTO_EVIDENCE_CLASSES.has(evidenceClass)) return false;
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
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
export function photoRowPlan(
  input: PhotoRowInput,
): Extract<AuthoritativeRowPlan, { table: "inspectionPhoto" }> {
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
