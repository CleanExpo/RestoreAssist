/**
 * Weakness-detection LLM contradiction pass (RA-5041 PR2).
 *
 * The deterministic layer (PR1) never compares free text — it flags which
 * narrative sections and unsupported-causation candidates still need a judged
 * pass in its `pendingLlmReview` list. This module is that pass: it adjudicates
 *   1. contradictions between the report's summary/notes/readings/photos and
 *      its recommendations, and
 *   2. the deterministic layer's unsupported-causation candidates against the
 *      report's evidence fields,
 * returning findings in the existing WeaknessFinding shape with
 * detectionMethod "llm".
 *
 * INTERFACE-FIRST: the route/orchestrator depends on the `LlmContradictionChecker`
 * interface, so route tests mock it; `llmContradictionChecker` is the real
 * implementation behind it. The implementation follows the repo's BYOK pattern
 * (lib/services/ai/validate-interview-response.ts): the calling route resolves
 * the workspace's own key (resolveWorkspaceAiKey) and passes it in; this module
 * spends it via routeAiRequest against the premium `weakness_detection` task
 * type — never the platform key.
 *
 * DEFENSIVE BOUNDARY: model output is an external API response. Malformed JSON,
 * an unexpected shape, or an API/transport error degrade to a single P2
 * "LLM review unavailable" finding — this module never throws, so the
 * deterministic findings it is merged with are never lost.
 *
 * @see https://linear.app/unite-group/issue/RA-5041
 */

import { randomUUID } from "node:crypto";
import { requireAiTaskPolicy } from "@/lib/ai/task-policy";
import { routeAiRequest } from "@/lib/ai/model-router";
import type { AllowedModel } from "@/lib/ai/byok-client";
import type { PendingLlmReview } from "./index";
import type {
  EvidenceAnchor,
  ReportSectionId,
  WeaknessCheckClass,
  WeaknessDetectionInput,
  WeaknessFinding,
  WeaknessSeverity,
} from "./types";

const MAX_OUTPUT_TOKENS = 2000;
const MAX_LLM_FINDINGS = 20;
const MAX_FIELD_CHARS = 600;

/** The narrative + evidence surfaces the model is asked to cross-check. */
const REPORT_SECTION_IDS: ReportSectionId[] = [
  "header",
  "property",
  "incident",
  "affectedAreas",
  "classification",
  "hazards",
  "scopeItems",
  "photos",
  "technicianNotes",
  "recommendations",
  "reportInstructions",
];

/** Only these two classes are LLM-judged; the rest are the deterministic layer's. */
const LLM_CHECK_CLASSES: WeaknessCheckClass[] = [
  "contradiction",
  "unsupported_causation",
];

const SYSTEM_PROMPT = `You are a Senior Project Manager reviewing an Australian water-damage restoration report before it leaves the system. Australian English throughout (e.g. "mould" not "mold").

Judge ONLY two things, and only for the sections you are told still need review:
1. CONTRADICTIONS between the report's narrative surfaces — summary, technician notes, moisture readings, photos, and recommendations. Flag a claim in one section that a different section contradicts.
2. UNSUPPORTED CAUSATION — for each causation candidate you are given, decide whether the report's evidence fields (documented source of loss, readings, photos) actually support the asserted cause. Flag it only when the evidence does NOT support it.

Rules:
- The system flags, the human decides. Flag only issues you are confident about. An empty findings list is correct when the report is internally consistent.
- Every finding MUST anchor to real report data: give the section, the field, and the exact quoted text that triggered it. If you cannot point to a specific supporting field, set evidenceAnchor to the string "unverified/missing".
- Do NOT invent IICRC section citations. Do NOT comment on spelling, grammar, or formatting — only on substance.
- severity: "P0" only for a hard contradiction that makes the report unsafe to hand over; "P1" for a contradiction/unsupported claim a reviewer must resolve; "P2" for a wording improvement.
- checkClass is "contradiction" or "unsupported_causation".

Respond with ONLY a JSON object, no prose, no markdown fences:
{"findings":[{"checkClass":"contradiction"|"unsupported_causation","severity":"P0"|"P1"|"P2","reportSectionId":"<section>","field":"<field>","quotedText":"<exact quote>","description":"<what is wrong>","suggestedAction":"<safe rewrite/action>"}]}

If the report is clean, respond exactly: {"findings":[]}`;

export interface LlmContradictionCheckInput {
  /** The structured report the deterministic layer already ran against. */
  report: WeaknessDetectionInput;
  /** The deterministic layer's deferred-review list — the only sections/candidates to judge. */
  pendingLlmReview: PendingLlmReview[];
  /** Deterministic unsupported-causation candidates the model must adjudicate. */
  causationCandidates: WeaknessFinding[];
  /** Workspace-owned BYOK key, resolved by the calling route. */
  apiKey: string;
  /** BYOK model to route the premium task to. */
  byokModel: AllowedModel;
}

/**
 * The dependency the route/orchestrator consumes. Mocked in route tests;
 * `llmContradictionChecker` is the real implementation.
 */
export interface LlmContradictionChecker {
  review(input: LlmContradictionCheckInput): Promise<WeaknessFinding[]>;
}

function truncate(input: string, max = MAX_FIELD_CHARS): string {
  return input.length <= max ? input : `${input.slice(0, max)}…`;
}

/** The single finding every degrade path collapses to — never throws past here. */
function llmUnavailableFinding(): WeaknessFinding {
  return {
    id: randomUUID(),
    checkClass: "contradiction",
    severity: "P2",
    evidenceAnchor: "unverified/missing",
    description:
      "LLM review unavailable — the contradiction/causation pass could not be completed. Deterministic findings are unaffected.",
    suggestedAction:
      "Re-run the weakness check, or review the flagged sections manually.",
    detectionMethod: "llm",
  };
}

function coerceSeverity(value: unknown): WeaknessSeverity {
  return value === "P0" || value === "P1" || value === "P2" ? value : "P1";
}

function coerceCheckClass(value: unknown): WeaknessCheckClass {
  return LLM_CHECK_CLASSES.includes(value as WeaknessCheckClass)
    ? (value as WeaknessCheckClass)
    : "contradiction";
}

function coerceEvidenceAnchor(raw: Record<string, unknown>): EvidenceAnchor | "unverified/missing" {
  const section = raw.reportSectionId;
  const field = typeof raw.field === "string" ? raw.field.trim() : "";
  const quotedText = typeof raw.quotedText === "string" ? raw.quotedText.trim() : "";
  if (
    typeof section === "string" &&
    REPORT_SECTION_IDS.includes(section as ReportSectionId) &&
    field.length > 0 &&
    quotedText.length > 0
  ) {
    return {
      reportSectionId: section as ReportSectionId,
      field: truncate(field, 200),
      quotedText: truncate(quotedText, 300),
    };
  }
  return "unverified/missing";
}

/**
 * Parse model output defensively. Any failure — non-JSON text, a non-array
 * `findings`, or an empty parse — is treated as "the model gave us nothing
 * usable" and degrades to the single P2 unavailable finding.
 */
function parseLlmFindings(responseText: string): WeaknessFinding[] {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [llmUnavailableFinding()];

  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    console.warn("[weakness-detection/llm] Failed to parse model output; degrading to P2 unavailable finding");
    return [llmUnavailableFinding()];
  }

  if (!Array.isArray(parsed?.findings)) {
    return [llmUnavailableFinding()];
  }

  const findings: WeaknessFinding[] = parsed.findings
    .slice(0, MAX_LLM_FINDINGS)
    .map((raw: unknown): WeaknessFinding | null => {
      const r = (raw ?? {}) as Record<string, unknown>;
      const description = typeof r.description === "string" ? r.description.trim() : "";
      if (!description) return null;
      const suggestedAction =
        typeof r.suggestedAction === "string" && r.suggestedAction.trim().length > 0
          ? truncate(r.suggestedAction.trim(), 400)
          : "Review the flagged section and reconcile or soften the wording.";
      return {
        id: randomUUID(),
        checkClass: coerceCheckClass(r.checkClass),
        severity: coerceSeverity(r.severity),
        evidenceAnchor: coerceEvidenceAnchor(r),
        description: truncate(description, 500),
        suggestedAction,
        detectionMethod: "llm",
      };
    })
    .filter((f): f is WeaknessFinding => f !== null);

  return findings;
}

function buildUserPrompt(input: LlmContradictionCheckInput): string {
  const { report, pendingLlmReview, causationCandidates } = input;

  const narrative: string[] = [];
  if (report.technicianNotes) {
    narrative.push(`technicianNotes: ${truncate(report.technicianNotes)}`);
  }
  if (report.reportInstructions) {
    narrative.push(`reportInstructions: ${truncate(report.reportInstructions)}`);
  }
  (report.recommendations ?? []).forEach((rec, i) => {
    if (rec) narrative.push(`recommendations[${i}]: ${truncate(rec)}`);
  });
  (report.affectedAreas ?? []).forEach((area, i) => {
    const readings = area.moistureReadings
      .map((mr) => `${mr.location} ${mr.value}${mr.unit}`)
      .join("; ");
    narrative.push(
      `affectedAreas[${i}] "${area.name}": readings=[${readings}] photos=${area.photos.length}`,
    );
  });
  (report.photos ?? []).forEach((p, i) => {
    narrative.push(
      `photos[${i}]: ${p.category ?? "uncategorised"}${p.location ? ` @ ${p.location}` : ""}`,
    );
  });

  const evidence: string[] = [];
  if (report.incident?.waterSource) evidence.push(`documented source of loss: ${report.incident.waterSource}`);
  if (report.incident?.waterCategory) evidence.push(`water category: ${report.incident.waterCategory}`);
  if (report.incident?.waterClass) evidence.push(`water class: ${report.incident.waterClass}`);

  const pending = pendingLlmReview.map((p) => `- ${p.reportSectionId}: ${p.reason}`).join("\n");
  const candidates = causationCandidates
    .map((c) => {
      const anchor =
        typeof c.evidenceAnchor === "string"
          ? c.evidenceAnchor
          : `${c.evidenceAnchor.reportSectionId}.${c.evidenceAnchor.field}: "${c.evidenceAnchor.quotedText}"`;
      return `- ${anchor}`;
    })
    .join("\n");

  return `REPORT NARRATIVE SURFACES:
${narrative.length > 0 ? narrative.join("\n") : "(none)"}

EVIDENCE FIELDS:
${evidence.length > 0 ? evidence.join("\n") : "(none documented)"}

SECTIONS STILL NEEDING REVIEW (only judge these):
${pending || "(none)"}

UNSUPPORTED-CAUSATION CANDIDATES TO ADJUDICATE:
${candidates || "(none)"}

Return findings for contradictions between the narrative surfaces above and for any causation candidate the evidence fields do not support.`;
}

export const llmContradictionChecker: LlmContradictionChecker = {
  async review(input: LlmContradictionCheckInput): Promise<WeaknessFinding[]> {
    // Nothing was deferred to the LLM — no spend, no findings.
    if (input.pendingLlmReview.length === 0 && input.causationCandidates.length === 0) {
      return [];
    }

    // Premium, tenant-scoped, citation-gated report work (see AI_TASK_POLICIES).
    requireAiTaskPolicy("report_drafting");

    try {
      const response = await routeAiRequest(
        {
          taskType: "weakness_detection",
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(input),
          temperature: 0.2,
          maxTokens: MAX_OUTPUT_TOKENS,
        },
        { byokModel: input.byokModel, byokApiKey: input.apiKey },
      );
      return parseLlmFindings(response.text ?? "");
    } catch (err) {
      // External API/transport failure — degrade, never kill the deterministic
      // results this is merged with.
      console.warn("[weakness-detection/llm] routeAiRequest failed; degrading to P2 unavailable finding", {
        reason: err instanceof Error ? err.name : "unknown",
      });
      return [llmUnavailableFinding()];
    }
  },
};
