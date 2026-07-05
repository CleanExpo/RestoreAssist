/**
 * Deterministic cross-section comparison for IICRC water Category/Class and
 * mould classification consistency. Compares the denormalised values on the
 * report's incident section against the structured Classification record,
 * and checks that a detected mould hazard carries its own category rather
 * than being conflated with the water classification.
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

import { randomUUID } from "node:crypto";
import { standardCite } from "@/lib/nir-standards-mapping";
import type { WeaknessDetectionInput, WeaknessFinding } from "./types";

/** Extracts the leading digit from strings like "Category 2", "Cat 2", "2". */
function extractDigit(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\d/);
  return match ? match[0] : null;
}

function contradictionFinding(args: {
  field: string;
  quotedA: string;
  quotedB: string;
  description: string;
  standardsCitation?: string;
}): WeaknessFinding {
  return {
    id: randomUUID(),
    checkClass: "category_separation",
    severity: "P1",
    evidenceAnchor: {
      reportSectionId: "incident",
      field: args.field,
      quotedText: `incident="${args.quotedA}" vs classification="${args.quotedB}"`,
    },
    description: args.description,
    suggestedAction:
      "Reconcile the two values so the report states a single, consistent classification.",
    detectionMethod: "deterministic",
    ...(args.standardsCitation ? { standardsCitation: args.standardsCitation } : {}),
  };
}

export function checkCategorySeparation(
  input: WeaknessDetectionInput,
): WeaknessFinding[] {
  const findings: WeaknessFinding[] = [];
  const classification = input.classification ?? null;
  const incident = input.incident ?? null;

  // Water category (Cat 1/2/3) consistency between incident and classification.
  const incidentCategory = extractDigit(incident?.waterCategory);
  const classificationCategory = extractDigit(classification?.category);
  if (incidentCategory && classificationCategory && incidentCategory !== classificationCategory) {
    findings.push(
      contradictionFinding({
        field: "waterCategory",
        quotedA: incident!.waterCategory!,
        quotedB: classification!.category!,
        description: `Water category differs between the incident summary (Category ${incidentCategory}) and the recorded classification (Category ${classificationCategory}).`,
        standardsCitation: standardCite("S500"),
      }),
    );
  }
  if (incidentCategory && !classification) {
    findings.push({
      id: randomUUID(),
      checkClass: "category_separation",
      severity: "P1",
      evidenceAnchor: "unverified/missing",
      description: `Incident summary asserts water Category ${incidentCategory} with no supporting Classification record to verify it against.`,
      suggestedAction:
        "Run/record the IICRC classification for this claim so the asserted category is backed by evidence.",
      detectionMethod: "deterministic",
      standardsCitation: standardCite("S500"),
    });
  }

  // Water class (Class 1-4) consistency between incident and classification.
  const incidentClass = extractDigit(incident?.waterClass);
  const classificationClass = extractDigit(classification?.class);
  if (incidentClass && classificationClass && incidentClass !== classificationClass) {
    findings.push(
      contradictionFinding({
        field: "waterClass",
        quotedA: incident!.waterClass!,
        quotedB: classification!.class!,
        description: `Water class differs between the incident summary (Class ${incidentClass}) and the recorded classification (Class ${classificationClass}).`,
        standardsCitation: standardCite("S500"),
      }),
    );
  }

  // Mould/water category separation: a detected mould hazard needs its own
  // category rather than being left to inherit/blend with the water class.
  if (input.hazards?.biologicalMouldDetected && !input.hazards.biologicalMouldCategory) {
    findings.push({
      id: randomUUID(),
      checkClass: "category_separation",
      severity: "P1",
      evidenceAnchor: "unverified/missing",
      description:
        "Mould growth is recorded as detected but has no separate mould category — it must not be assumed to share the water damage's category/class.",
      suggestedAction:
        "Record the mould category (hazards.biologicalMouldCategory) independently of the water classification.",
      detectionMethod: "deterministic",
      standardsCitation: standardCite("S520"),
    });
  }

  return findings;
}
