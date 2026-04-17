/**
 * RA-876: Billing Completeness Check
 *
 * Automated pre-invoice billing validation that catches missing scope items
 * before an estimate is approved. Called on DRAFT → INTERNAL_REVIEW transition.
 *
 * Two-tier severity:
 *   - Blockers: return 422, cannot transition state
 *   - Warnings: returned in response, can be dismissed per-estimate (stored in
 *     Estimate.metadata JSON blob { dismissedWarnings: [code...] })
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockerCode =
  | "NO_LINE_ITEMS"
  | "ZERO_TOTAL"
  | "MISSING_MOBILISATION"
  | "FIRE_NO_SMOKE_TREATMENT";

export type WarningCode =
  | "NO_MONITORING_ITEMS"
  | "EQUIPMENT_QTY_LOW"
  | "NO_PRELIMS"
  | "MOULD_NO_CLEARANCE"
  | "CONTENTS_NO_S760";

export interface BillingBlocker {
  code: BlockerCode;
  message: string;
}

export interface BillingWarning {
  code: WarningCode;
  message: string;
  dismissed?: boolean;
}

export interface BillingCompletenessResult {
  complete: boolean; // true iff blockers.length === 0
  blockers: BillingBlocker[];
  warnings: BillingWarning[];
}

// ─── Input shape ──────────────────────────────────────────────────────────────

/**
 * Minimal shape the check needs — callers pass a projected view of the estimate.
 * Decoupled from Prisma types so the function is pure and easy to test.
 */
export interface EstimateForCheck {
  /** Calculated total (ex GST). $0 triggers ZERO_TOTAL. */
  subtotalExGST?: number | null;
  /** Estimated job duration in days. Drives mobilisation + monitoring checks. */
  estimatedDuration?: number | null;
  /** JSON-text metadata, parsed to read dismissedWarnings. */
  metadata?: string | null;
  /** Line items as stored on the estimate. */
  lineItems: ReadonlyArray<{
    category: string;
    description: string;
    qty: number;
    subtotal: number;
  }>;
  /** Optional upstream scope context (scope items + affected area). */
  scope?: {
    scopeType: string; // "WATER" | "FIRE" | "MOULD" | "MULTI_LOSS"
    scopeItemCount?: number | null; // # of scope items — > 0 and lineItems empty triggers NO_LINE_ITEMS
    affectedAreaM2?: number | null; // used for EQUIPMENT_QTY_LOW heuristic
    s760ChecklistCompleted?: boolean | null; // contents checklist done?
  } | null;
}

// ─── Keyword matching ─────────────────────────────────────────────────────────

const MOBILISATION_KEYWORDS = ["mobilis", "mobiliz", "call out", "call-out"];
const MONITORING_KEYWORDS = ["monitor", "moisture reading", "inspection visit"];
const PRELIMS_KEYWORDS = ["prelim", "preliminar", "set up", "setup"];
const SMOKE_TREATMENT_KEYWORDS = [
  "smoke",
  "soot",
  "ozone",
  "thermal fog",
  "hydroxyl",
];
const MOULD_CLEARANCE_KEYWORDS = [
  "clearance test",
  "clearance testing",
  "post-remediation verification",
  "prv",
  "air sample",
];
const CONTENTS_KEYWORDS = ["contents", "pack out", "pack-out", "pack in"];
const EQUIPMENT_KEYWORDS = [
  "dehumidifier",
  "air mover",
  "lgr",
  "afd",
  "hepa",
];

function lineMatches(
  items: EstimateForCheck["lineItems"],
  keywords: string[],
): boolean {
  const lowered = keywords.map((k) => k.toLowerCase());
  return items.some((li) => {
    const hay = `${li.description} ${li.category}`.toLowerCase();
    return lowered.some((k) => hay.includes(k));
  });
}

function countEquipmentUnits(items: EstimateForCheck["lineItems"]): number {
  return items
    .filter((li) => {
      const hay = `${li.description} ${li.category}`.toLowerCase();
      return EQUIPMENT_KEYWORDS.some((k) => hay.includes(k));
    })
    .reduce((sum, li) => sum + (li.qty || 0), 0);
}

// ─── Dismissal metadata ───────────────────────────────────────────────────────

function parseDismissed(
  metadata: string | null | undefined,
): Set<WarningCode> {
  if (!metadata) return new Set();
  try {
    const obj = JSON.parse(metadata) as { dismissedWarnings?: unknown };
    if (Array.isArray(obj?.dismissedWarnings)) {
      return new Set(
        obj.dismissedWarnings.filter(
          (v): v is WarningCode => typeof v === "string",
        ),
      );
    }
  } catch {
    // Malformed metadata JSON — treat as no dismissals, surface via log
    console.warn("[billing-completeness-check] Malformed estimate metadata");
  }
  return new Set();
}

// ─── Check helpers — each returns blocker or null ─────────────────────────────

function checkNoLineItems(e: EstimateForCheck): BillingBlocker | null {
  const hasScopeItems = (e.scope?.scopeItemCount ?? 0) > 0;
  if (hasScopeItems && e.lineItems.length === 0) {
    return {
      code: "NO_LINE_ITEMS",
      message:
        "Scope has items but the estimate has no line items. Generate line items before submitting for review.",
    };
  }
  return null;
}

function checkZeroTotal(e: EstimateForCheck): BillingBlocker | null {
  const total = e.subtotalExGST ?? 0;
  if (e.lineItems.length > 0 && total <= 0) {
    return {
      code: "ZERO_TOTAL",
      message: "Estimate total is $0 — review line item rates and quantities.",
    };
  }
  return null;
}

function checkMissingMobilisation(
  e: EstimateForCheck,
): BillingBlocker | null {
  const days = e.estimatedDuration ?? 0;
  if (days >= 2 && !lineMatches(e.lineItems, MOBILISATION_KEYWORDS)) {
    return {
      code: "MISSING_MOBILISATION",
      message: `Job is ${days.toFixed(1)} days but has no mobilisation / call-out line item.`,
    };
  }
  return null;
}

function checkFireNoSmokeTreatment(
  e: EstimateForCheck,
): BillingBlocker | null {
  if (
    e.scope?.scopeType === "FIRE" &&
    !lineMatches(e.lineItems, SMOKE_TREATMENT_KEYWORDS)
  ) {
    return {
      code: "FIRE_NO_SMOKE_TREATMENT",
      message:
        "Fire job has no smoke / soot / ozone / thermal fog treatment line item.",
    };
  }
  return null;
}

function checkNoMonitoringItems(e: EstimateForCheck): BillingWarning | null {
  const days = e.estimatedDuration ?? 0;
  if (days >= 2 && !lineMatches(e.lineItems, MONITORING_KEYWORDS)) {
    return {
      code: "NO_MONITORING_ITEMS",
      message: `Multi-day job (${days.toFixed(1)} days) has no monitoring / moisture-reading visits scheduled.`,
    };
  }
  return null;
}

function checkEquipmentQtyLow(e: EstimateForCheck): BillingWarning | null {
  const area = e.scope?.affectedAreaM2 ?? 0;
  if (area <= 0) return null;
  const units = countEquipmentUnits(e.lineItems);
  if (units === 0) return null; // Different issue; surface elsewhere
  const expected = area / 40;
  if (units < expected) {
    return {
      code: "EQUIPMENT_QTY_LOW",
      message: `${units} equipment units for ${area} m² — IICRC S500 suggests ≥ 1 dehumidifier per 40 m² (${expected.toFixed(1)}).`,
    };
  }
  return null;
}

function checkNoPrelims(e: EstimateForCheck): BillingWarning | null {
  if (!lineMatches(e.lineItems, PRELIMS_KEYWORDS)) {
    return {
      code: "NO_PRELIMS",
      message:
        "Estimate has no preliminaries / set-up line items (IICRC recommends itemised prelims).",
    };
  }
  return null;
}

function checkMouldNoClearance(e: EstimateForCheck): BillingWarning | null {
  if (
    e.scope?.scopeType === "MOULD" &&
    !lineMatches(e.lineItems, MOULD_CLEARANCE_KEYWORDS)
  ) {
    return {
      code: "MOULD_NO_CLEARANCE",
      message:
        "Mould remediation job has no clearance testing / post-remediation verification line item (IICRC S520).",
    };
  }
  return null;
}

function checkContentsNoS760(e: EstimateForCheck): BillingWarning | null {
  const hasContents = lineMatches(e.lineItems, CONTENTS_KEYWORDS);
  if (hasContents && e.scope?.s760ChecklistCompleted === false) {
    return {
      code: "CONTENTS_NO_S760",
      message:
        "Contents items present but S760 contents-restoration checklist not completed.",
    };
  }
  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function checkBillingCompleteness(
  estimate: EstimateForCheck,
): BillingCompletenessResult {
  const blockers: BillingBlocker[] = [];
  const warnings: BillingWarning[] = [];

  // Hard blockers — ordered by severity for first-surface-wins UX
  for (const fn of [
    checkNoLineItems,
    checkZeroTotal,
    checkMissingMobilisation,
    checkFireNoSmokeTreatment,
  ]) {
    const b = fn(estimate);
    if (b) blockers.push(b);
  }

  // Warnings
  const dismissed = parseDismissed(estimate.metadata);
  for (const fn of [
    checkNoMonitoringItems,
    checkEquipmentQtyLow,
    checkNoPrelims,
    checkMouldNoClearance,
    checkContentsNoS760,
  ]) {
    const w = fn(estimate);
    if (!w) continue;
    if (dismissed.has(w.code)) {
      warnings.push({ ...w, dismissed: true });
    } else {
      warnings.push(w);
    }
  }

  return {
    complete: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ─── Dismissal helper ─────────────────────────────────────────────────────────

/**
 * Merge a dismissal list into an existing metadata JSON blob, preserving any
 * other keys. Returns the stringified JSON ready to persist to Estimate.metadata.
 */
export function addDismissedWarnings(
  currentMetadata: string | null | undefined,
  codes: WarningCode[],
): string {
  let current: Record<string, unknown> = {};
  if (currentMetadata) {
    try {
      const parsed = JSON.parse(currentMetadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        current = parsed as Record<string, unknown>;
      }
    } catch {
      // fall through — overwrite malformed metadata
    }
  }
  const existing = Array.isArray(current.dismissedWarnings)
    ? (current.dismissedWarnings as string[])
    : [];
  const next = Array.from(new Set([...existing, ...codes]));
  return JSON.stringify({ ...current, dismissedWarnings: next });
}
