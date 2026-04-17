/**
 * RA-876: Unit tests for billing-completeness-check.
 *
 * Covers all 4 blockers + 5 warnings + dismissal handling.
 */

import { describe, it, expect } from "vitest";
import {
  checkBillingCompleteness,
  addDismissedWarnings,
  type EstimateForCheck,
} from "../billing-completeness-check";

function base(overrides: Partial<EstimateForCheck> = {}): EstimateForCheck {
  return {
    subtotalExGST: 5000,
    estimatedDuration: 1,
    metadata: null,
    lineItems: [
      {
        category: "Labour",
        description: "Master Qualified Technician",
        qty: 8,
        subtotal: 800,
      },
    ],
    scope: {
      scopeType: "WATER",
      scopeItemCount: 5,
      affectedAreaM2: null,
      s760ChecklistCompleted: null,
    },
    ...overrides,
  };
}

// ─── Blockers ─────────────────────────────────────────────────────────────────

describe("blockers", () => {
  it("NO_LINE_ITEMS when scope has items but estimate has none", () => {
    const r = checkBillingCompleteness(base({ lineItems: [] }));
    expect(r.complete).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("NO_LINE_ITEMS");
  });

  it("ZERO_TOTAL when lineItems present but subtotal is 0", () => {
    const r = checkBillingCompleteness(base({ subtotalExGST: 0 }));
    expect(r.complete).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("ZERO_TOTAL");
  });

  it("ZERO_TOTAL not raised when there are no line items (NO_LINE_ITEMS wins)", () => {
    const r = checkBillingCompleteness(
      base({ subtotalExGST: 0, lineItems: [] }),
    );
    expect(r.blockers.map((b) => b.code)).not.toContain("ZERO_TOTAL");
  });

  it("MISSING_MOBILISATION when job ≥ 2 days has no mobilisation line", () => {
    const r = checkBillingCompleteness(
      base({
        estimatedDuration: 3,
        lineItems: [
          {
            category: "Labour",
            description: "Technician",
            qty: 10,
            subtotal: 1000,
          },
        ],
      }),
    );
    expect(r.complete).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("MISSING_MOBILISATION");
  });

  it("MISSING_MOBILISATION not raised for short jobs (< 2 days)", () => {
    const r = checkBillingCompleteness(base({ estimatedDuration: 1 }));
    expect(r.blockers.map((b) => b.code)).not.toContain("MISSING_MOBILISATION");
  });

  it("MISSING_MOBILISATION satisfied by 'Call out' line item", () => {
    const r = checkBillingCompleteness(
      base({
        estimatedDuration: 3,
        lineItems: [
          {
            category: "Prelims",
            description: "Call out fee",
            qty: 1,
            subtotal: 200,
          },
        ],
      }),
    );
    expect(r.blockers.map((b) => b.code)).not.toContain("MISSING_MOBILISATION");
  });

  it("FIRE_NO_SMOKE_TREATMENT when FIRE job has no smoke/soot/ozone item", () => {
    const r = checkBillingCompleteness(
      base({
        scope: {
          scopeType: "FIRE",
          scopeItemCount: 5,
          affectedAreaM2: null,
          s760ChecklistCompleted: null,
        },
      }),
    );
    expect(r.complete).toBe(false);
    expect(r.blockers.map((b) => b.code)).toContain("FIRE_NO_SMOKE_TREATMENT");
  });

  it("FIRE_NO_SMOKE_TREATMENT satisfied by ozone item", () => {
    const r = checkBillingCompleteness(
      base({
        scope: {
          scopeType: "FIRE",
          scopeItemCount: 5,
          affectedAreaM2: null,
          s760ChecklistCompleted: null,
        },
        lineItems: [
          {
            category: "Specialist",
            description: "Ozone deodorisation treatment",
            qty: 2,
            subtotal: 400,
          },
        ],
      }),
    );
    expect(r.blockers.map((b) => b.code)).not.toContain(
      "FIRE_NO_SMOKE_TREATMENT",
    );
  });

  it("complete=true for minimal valid estimate", () => {
    const r = checkBillingCompleteness(base());
    expect(r.complete).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });
});

// ─── Warnings ─────────────────────────────────────────────────────────────────

describe("warnings", () => {
  it("NO_MONITORING_ITEMS on multi-day job without monitoring", () => {
    const r = checkBillingCompleteness(base({ estimatedDuration: 3, lineItems: [
      { category: "Labour", description: "Tech", qty: 10, subtotal: 1000 },
      { category: "Prelims", description: "Mobilisation", qty: 1, subtotal: 200 },
    ] }));
    expect(r.warnings.map((w) => w.code)).toContain("NO_MONITORING_ITEMS");
  });

  it("NO_MONITORING_ITEMS not raised when moisture reading line present", () => {
    const r = checkBillingCompleteness(
      base({
        estimatedDuration: 3,
        lineItems: [
          {
            category: "Labour",
            description: "Tech",
            qty: 10,
            subtotal: 1000,
          },
          {
            category: "Prelims",
            description: "Mobilisation",
            qty: 1,
            subtotal: 200,
          },
          {
            category: "Monitoring",
            description: "Daily moisture reading visits",
            qty: 3,
            subtotal: 300,
          },
        ],
      }),
    );
    expect(r.warnings.map((w) => w.code)).not.toContain("NO_MONITORING_ITEMS");
  });

  it("EQUIPMENT_QTY_LOW when dehumidifier units below 1-per-40m² ratio", () => {
    const r = checkBillingCompleteness(
      base({
        scope: {
          scopeType: "WATER",
          scopeItemCount: 5,
          affectedAreaM2: 200,
          s760ChecklistCompleted: null,
        },
        lineItems: [
          {
            category: "Equipment",
            description: "LGR dehumidifier",
            qty: 2, // 200/40 = 5 expected, 2 is low
            subtotal: 400,
          },
        ],
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain("EQUIPMENT_QTY_LOW");
  });

  it("NO_PRELIMS when no preliminaries line item", () => {
    const r = checkBillingCompleteness(
      base({
        lineItems: [
          { category: "Labour", description: "Tech", qty: 8, subtotal: 800 },
        ],
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain("NO_PRELIMS");
  });

  it("MOULD_NO_CLEARANCE when MOULD job missing clearance testing", () => {
    const r = checkBillingCompleteness(
      base({
        scope: {
          scopeType: "MOULD",
          scopeItemCount: 5,
          affectedAreaM2: null,
          s760ChecklistCompleted: null,
        },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain("MOULD_NO_CLEARANCE");
  });

  it("CONTENTS_NO_S760 when contents items present but S760 not completed", () => {
    const r = checkBillingCompleteness(
      base({
        lineItems: [
          {
            category: "Contents",
            description: "Contents pack-out",
            qty: 1,
            subtotal: 500,
          },
        ],
        scope: {
          scopeType: "WATER",
          scopeItemCount: 5,
          affectedAreaM2: null,
          s760ChecklistCompleted: false,
        },
      }),
    );
    expect(r.warnings.map((w) => w.code)).toContain("CONTENTS_NO_S760");
  });

  it("CONTENTS_NO_S760 not raised when S760 completed", () => {
    const r = checkBillingCompleteness(
      base({
        lineItems: [
          {
            category: "Contents",
            description: "Contents pack-out",
            qty: 1,
            subtotal: 500,
          },
        ],
        scope: {
          scopeType: "WATER",
          scopeItemCount: 5,
          affectedAreaM2: null,
          s760ChecklistCompleted: true,
        },
      }),
    );
    expect(r.warnings.map((w) => w.code)).not.toContain("CONTENTS_NO_S760");
  });
});

// ─── Dismissal handling ───────────────────────────────────────────────────────

describe("dismissal metadata", () => {
  it("dismissed warnings are flagged with dismissed=true but still returned", () => {
    const r = checkBillingCompleteness(
      base({
        metadata: JSON.stringify({
          dismissedWarnings: ["NO_MONITORING_ITEMS"],
        }),
        estimatedDuration: 3,
        lineItems: [
          { category: "Labour", description: "Tech", qty: 10, subtotal: 1000 },
          {
            category: "Prelims",
            description: "Mobilisation",
            qty: 1,
            subtotal: 200,
          },
        ],
      }),
    );
    const monitoring = r.warnings.find(
      (w) => w.code === "NO_MONITORING_ITEMS",
    );
    expect(monitoring?.dismissed).toBe(true);
  });

  it("malformed metadata JSON does not throw — treats as no dismissals", () => {
    const r = checkBillingCompleteness(
      base({ metadata: "not-json" }),
    );
    expect(r).toBeTruthy();
  });

  it("addDismissedWarnings merges codes preserving other keys", () => {
    const current = JSON.stringify({
      dismissedWarnings: ["NO_MONITORING_ITEMS"],
      otherKey: "preserved",
    });
    const next = addDismissedWarnings(current, ["NO_PRELIMS"]);
    const parsed = JSON.parse(next);
    expect(parsed.dismissedWarnings).toEqual(
      expect.arrayContaining(["NO_MONITORING_ITEMS", "NO_PRELIMS"]),
    );
    expect(parsed.otherKey).toBe("preserved");
  });

  it("addDismissedWarnings starts fresh when metadata is null", () => {
    const next = addDismissedWarnings(null, ["NO_PRELIMS"]);
    expect(JSON.parse(next).dismissedWarnings).toEqual(["NO_PRELIMS"]);
  });

  it("addDismissedWarnings deduplicates", () => {
    const current = JSON.stringify({
      dismissedWarnings: ["NO_PRELIMS"],
    });
    const next = addDismissedWarnings(current, ["NO_PRELIMS", "NO_PRELIMS"]);
    expect(JSON.parse(next).dismissedWarnings).toEqual(["NO_PRELIMS"]);
  });
});
