/**
 * Deterministic term-list/regex scan for absolute/risky report language and
 * unsupported-causation candidates. Zero AI spend — cheap, unit-testable,
 * runs against the report's own free-text fields.
 *
 * Red-line breaches (absolute health/safety/legal/insurance/remediation
 * claims) are hard-stop P0 findings per the ticket's acceptance criterion.
 * Cause-attribution phrasing ("caused by", "due to", "resulted from") is
 * flagged as an unsupported_causation P1 CANDIDATE whenever the report has
 * no documented water-source field to anchor the claim against — real
 * adjudication against evidence is the PR2 LLM pass.
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

import { randomUUID } from "node:crypto";
import type {
  ReportSectionId,
  WeaknessDetectionInput,
  WeaknessFinding,
} from "./types";

/** Absolute/risky phrases that read as a guarantee, certification, or completion claim. */
const REDLINE_PHRASES: string[] = [
  "guaranteed dry",
  "no mould present",
  "no mold present",
  "100% safe",
  "certified mould-free",
  "certified mold-free",
  "completely restored",
];

/** Cause-attribution phrasing — legitimate when backed by a documented source of loss. */
const CAUSATION_PHRASES: string[] = ["caused by", "due to", "resulted from"];

interface TextField {
  reportSectionId: ReportSectionId;
  field: string;
  text: string;
}

function collectTextFields(input: WeaknessDetectionInput): TextField[] {
  const fields: TextField[] = [];

  if (input.technicianNotes) {
    fields.push({
      reportSectionId: "technicianNotes",
      field: "technicianNotes",
      text: input.technicianNotes,
    });
  }

  if (input.reportInstructions) {
    fields.push({
      reportSectionId: "reportInstructions",
      field: "reportInstructions",
      text: input.reportInstructions,
    });
  }

  (input.recommendations ?? []).forEach((text, i) => {
    if (text) {
      fields.push({
        reportSectionId: "recommendations",
        field: `recommendations[${i}]`,
        text,
      });
    }
  });

  return fields;
}

function findAllMatches(text: string, phrase: string): string[] {
  const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

export function checkRedlineLanguage(
  input: WeaknessDetectionInput,
): WeaknessFinding[] {
  const findings: WeaknessFinding[] = [];
  const textFields = collectTextFields(input);
  const hasDocumentedWaterSource = Boolean(
    input.incident?.waterSource && input.incident.waterSource.trim().length > 0,
  );

  for (const { reportSectionId, field, text } of textFields) {
    for (const phrase of REDLINE_PHRASES) {
      for (const quotedText of findAllMatches(text, phrase)) {
        findings.push({
          id: randomUUID(),
          checkClass: "redline_language",
          severity: "P0",
          evidenceAnchor: { reportSectionId, field, quotedText },
          description: `Absolute/risky language "${quotedText}" reads as a guarantee or certification claim rather than a documented finding.`,
          suggestedAction:
            "Rewrite as a neutral, evidence-anchored statement (e.g. cite the specific reading, test result, or standard clause instead of an absolute claim).",
          detectionMethod: "deterministic",
        });
      }
    }

    if (!hasDocumentedWaterSource) {
      for (const phrase of CAUSATION_PHRASES) {
        for (const quotedText of findAllMatches(text, phrase)) {
          findings.push({
            id: randomUUID(),
            checkClass: "unsupported_causation",
            severity: "P1",
            evidenceAnchor: { reportSectionId, field, quotedText },
            description: `Cause-attribution phrasing "${quotedText}" has no documented source-of-loss field to anchor it against.`,
            suggestedAction:
              "Either document the source of loss (incident.waterSource) to support this claim, or soften the wording to describe the observation without asserting cause.",
            detectionMethod: "deterministic",
          });
        }
      }
    }
  }

  return findings;
}
