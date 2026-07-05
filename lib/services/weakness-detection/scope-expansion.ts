/**
 * Deterministic diff of recommended scope against an authorised
 * work-order/scope-of-works baseline.
 *
 * CAVEAT (see RA-5041 PR1 description): the schema has no record type that
 * captures an authorised scope-of-works baseline to diff against — Prisma's
 * ScopeItem is the recommended/system-determined scope, and ScopeVariation
 * only tracks deltas off an implicit, unrecorded baseline. Rather than
 * fabricate a diff against something that was never captured, this check
 * returns a single P2 finding stating that scope-expansion could not be
 * verified whenever no authorised baseline is supplied. When a baseline
 * *is* supplied (future wiring, once such a record exists), it performs a
 * real diff and flags recommended items not present in the authorised set.
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

import { randomUUID } from "node:crypto";
import type { WeaknessDetectionInput, WeaknessFinding } from "./types";

function normalise(description: string): string {
  return description.trim().toLowerCase();
}

export function checkScopeExpansion(
  input: WeaknessDetectionInput,
): WeaknessFinding[] {
  const recommended = input.scopeItems ?? [];
  const authorised = input.authorisedScopeItems;

  if (!authorised) {
    return [
      {
        id: randomUUID(),
        checkClass: "scope_expansion",
        severity: "P2",
        evidenceAnchor: "unverified/missing",
        description:
          "No authorised scope-of-works/work-order record exists in this report to compare recommended scope against.",
        suggestedAction:
          "Attach or link the signed/authorised scope-of-works so recommended scope can be automatically checked for expansion beyond what was approved.",
        detectionMethod: "deterministic",
      },
    ];
  }

  const authorisedDescriptions = new Set(
    authorised.map((item) => normalise(item.description)),
  );

  const findings: WeaknessFinding[] = [];
  recommended.forEach((item, i) => {
    if (!authorisedDescriptions.has(normalise(item.description))) {
      findings.push({
        id: randomUUID(),
        checkClass: "scope_expansion",
        severity: "P1",
        evidenceAnchor: {
          reportSectionId: "scopeItems",
          field: `scopeItems[${i}].description`,
          quotedText: item.description,
        },
        description: `Recommended scope item "${item.description}" is not present in the authorised scope-of-works.`,
        suggestedAction:
          "Confirm this item is authorised (obtain sign-off) or remove it from the recommended scope.",
        detectionMethod: "deterministic",
      });
    }
  });

  return findings;
}
