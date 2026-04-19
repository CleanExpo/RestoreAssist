/**
 * RA-859 Task 3 — Billing completeness check.
 *
 * Runs before an invoice is finalised to surface warnings when the scope
 * is missing items that every job type should contain (mobilisation, daily
 * monitoring, waste disposal). These are the same items scope-prelims.ts
 * generates — but users can still remove them from the scope manually,
 * and this check catches that before revenue leakage hits the invoice.
 *
 * Warnings are advisory, not blocking — invoice generation still
 * proceeds; the warnings surface in the UI so the estimator can choose
 * to add the missing lines.
 */

export interface BillingWarning {
  code:
    | "MISSING_MOBILISATION"
    | "MISSING_MONITORING"
    | "MISSING_WASTE_DISPOSAL"
    | "MISSING_PPE"
    | "MISSING_EQUIPMENT_TRANSPORT"
    | "MISSING_BIOHAZARD_COMPLIANCE"
    | "MISSING_EPA_MANIFEST"
    | "MISSING_CLEARANCE_TESTING";
  severity: "warning" | "error";
  message: string;
  suggestedRate?: number;
}

export interface CompletenessCheckInput {
  scopeItems: ReadonlyArray<{ itemType: string; quantity?: number | null }>;
  damageType?:
    | "WATER"
    | "FIRE"
    | "MOULD"
    | "STORM"
    | "BIOHAZARD"
    | "MULTI_LOSS"
    | "GENERAL"
    | null;
  /** For biohazard jobs — drives the additional checks below. */
  biohazardType?:
    | "sewage_overflow"
    | "decomposition"
    | "chemical_spill"
    | "blood_trauma"
    | null;
  /** For mould — Class ≥ 2 requires clearance testing (S520:2015 §7.2). */
  mouldContaminationClass?: 1 | 2 | 3 | 4 | null;
}

/** Does the scope contain any item whose `itemType` matches one in `accepts`? */
function has(
  items: CompletenessCheckInput["scopeItems"],
  accepts: readonly string[],
): boolean {
  return items.some((i) => accepts.includes(i.itemType));
}

/**
 * Run the completeness check. Returns an array of warnings; empty = clean.
 * Never throws — defensive against malformed scope-item shapes.
 */
export function checkBillingCompleteness(
  input: CompletenessCheckInput,
): BillingWarning[] {
  const warnings: BillingWarning[] = [];
  const items = input.scopeItems ?? [];

  // ── Universal prelims ─────────────────────────────────────────────────
  if (!has(items, ["mobilisation"])) {
    warnings.push({
      code: "MISSING_MOBILISATION",
      severity: "warning",
      message:
        "No mobilisation / site attendance line item. Every job should carry a mobilisation fee (IICRC S500:2025 §4.1).",
      suggestedRate: 180,
    });
  }

  if (
    !has(items, ["daily_monitoring", "monitoring_visit"]) &&
    input.damageType !== "BIOHAZARD" // trauma jobs are single-visit
  ) {
    warnings.push({
      code: "MISSING_MONITORING",
      severity: "warning",
      message:
        "No daily monitoring visit line item. Multi-day drying jobs require documented daily psychrometric readings (S500:2025 §8.3).",
      suggestedRate: 165,
    });
  }

  if (
    !has(items, [
      "waste_disposal",
      "waste_disposal_standard",
      "waste_disposal_contaminated",
      "licensed_disposal",
      "specialist_disposal",
    ])
  ) {
    warnings.push({
      code: "MISSING_WASTE_DISPOSAL",
      severity: "warning",
      message:
        "No waste disposal line item. Tipping fees and licensed carrier costs are commonly forgotten and represent $100–$400 of leakage per job.",
      suggestedRate: 220,
    });
  }

  if (!has(items, ["safety_ppe", "ppe_standard", "ppe_premium"])) {
    warnings.push({
      code: "MISSING_PPE",
      severity: "warning",
      message:
        "No PPE line item. Disposable PPE consumables should appear on every restoration invoice (Safe Work AU PPE CoP).",
      suggestedRate: 85,
    });
  }

  if (!has(items, ["equipment_transport"])) {
    warnings.push({
      code: "MISSING_EQUIPMENT_TRANSPORT",
      severity: "warning",
      message:
        "No equipment transport line item. Delivery + retrieval of air movers/dehumidifiers is billable.",
      suggestedRate: 140,
    });
  }

  // ── Biohazard-specific ────────────────────────────────────────────────
  if (input.damageType === "BIOHAZARD") {
    if (!has(items, ["biohazard_handling_compliance"])) {
      warnings.push({
        code: "MISSING_BIOHAZARD_COMPLIANCE",
        severity: "error",
        message:
          "Biohazard jobs must carry a Safe Work Australia biohazard handling compliance line (SWMS documentation).",
      });
    }
    if (!has(items, ["epa_waste_manifest"])) {
      warnings.push({
        code: "MISSING_EPA_MANIFEST",
        severity: "error",
        message:
          "Biohazard jobs must include a state EPA waste manifest line for licensed disposal tracking.",
      });
    }
    if (
      input.biohazardType !== "chemical_spill" &&
      !has(items, ["clearance_testing", "air_quality_clearance"])
    ) {
      warnings.push({
        code: "MISSING_CLEARANCE_TESTING",
        severity: "warning",
        message:
          "Biohazard remediation should include post-remediation clearance testing (IICRC S540:2021 §5).",
      });
    }
  }

  // ── Mould-specific: Class ≥ 2 requires clearance testing ───────────────
  if (
    input.damageType === "MOULD" &&
    (input.mouldContaminationClass ?? 0) >= 2 &&
    !has(items, ["clearance_testing"])
  ) {
    warnings.push({
      code: "MISSING_CLEARANCE_TESTING",
      severity: "warning",
      message:
        "Mould remediation at Class ≥ 2 requires post-remediation clearance testing before re-occupancy (S520:2015 §7.2).",
    });
  }

  return warnings;
}

/**
 * Convenience wrapper — returns only error-severity warnings. Callers that
 * want a hard gate (refuse to finalise the invoice) use this.
 */
export function blockingBillingWarnings(
  input: CompletenessCheckInput,
): BillingWarning[] {
  return checkBillingCompleteness(input).filter((w) => w.severity === "error");
}
