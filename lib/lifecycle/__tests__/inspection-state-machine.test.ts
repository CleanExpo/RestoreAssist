/**
 * SP-A Task 2 — InspectionStatus state-machine matrix.
 *
 * Pure-function tests; no Prisma, no fixtures. Asserts the canTransition
 * gate is deterministic for every (from, to) tuple and that nextSuggestions
 * surfaces close_job only when all preconditions clear.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 2.
 */
import { describe, expect, it } from "vitest";
import { InspectionStatus } from "@prisma/client";
import {
  canTransition,
  nextSuggestions,
  TRANSITION_REQUIREMENTS,
  type TransitionContext,
} from "../inspection-state-machine";

const baseCtx: TransitionContext = {
  invoiceStatus: "PAID",
  reportStatus: "SENT",
  handoverCompletedAt: new Date("2026-05-14T00:00:00.000Z"),
};

describe("canTransition — legal edges", () => {
  it("SUBMITTED → IN_BILLING is legal (no precondition gating yet)", () => {
    const result = canTransition(
      InspectionStatus.SUBMITTED,
      InspectionStatus.IN_BILLING,
      baseCtx,
    );
    expect(result.ok).toBe(true);
  });

  it("IN_BILLING → CLOSED is legal when all preconditions clear", () => {
    const result = canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      baseCtx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.softGaps).toEqual([]);
    }
  });

  it("CLOSED → ARCHIVED is legal (terminal trio chain)", () => {
    const result = canTransition(
      InspectionStatus.CLOSED,
      InspectionStatus.ARCHIVED,
      baseCtx,
    );
    expect(result.ok).toBe(true);
  });
});

describe("canTransition — illegal edges", () => {
  it("DRAFT → CLOSED is illegal (skips required intermediate states)", () => {
    const result = canTransition(
      InspectionStatus.DRAFT,
      InspectionStatus.CLOSED,
      baseCtx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("invalid_transition");
    }
  });

  it("CLOSED → DRAFT is illegal (terminal state is forward-only)", () => {
    const result = canTransition(
      InspectionStatus.CLOSED,
      InspectionStatus.DRAFT,
      baseCtx,
    );
    expect(result.ok).toBe(false);
  });

  it("ARCHIVED → CLOSED is illegal (archive is one-way)", () => {
    const result = canTransition(
      InspectionStatus.ARCHIVED,
      InspectionStatus.CLOSED,
      baseCtx,
    );
    expect(result.ok).toBe(false);
  });
});

describe("canTransition — precondition gating", () => {
  it("IN_BILLING → CLOSED fails with missing invoice_paid when invoice unpaid", () => {
    const result = canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      { ...baseCtx, invoiceStatus: "ISSUED" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("invoice_paid");
    }
  });

  it("IN_BILLING → CLOSED fails with missing report_sent when report not sent", () => {
    const result = canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      { ...baseCtx, reportStatus: "DRAFT" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("report_sent");
    }
  });

  it("IN_BILLING → CLOSED fails listing all missing preconditions, not just first", () => {
    const result = canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      { ...baseCtx, invoiceStatus: "ISSUED", reportStatus: "DRAFT" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("invoice_paid");
      expect(result.missing).toContain("report_sent");
    }
  });

  it("IN_BILLING → CLOSED surfaces handover as soft gap when missing (not blocker)", () => {
    const result = canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      { ...baseCtx, handoverCompletedAt: null },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.softGaps).toContain("handover_pending");
    }
  });
});

describe("nextSuggestions", () => {
  it("returns close_job suggestion from IN_BILLING with all preconditions clear", () => {
    const out = nextSuggestions(InspectionStatus.IN_BILLING, baseCtx);
    expect(out.map((s) => s.key)).toContain("close_job");
    const close = out.find((s) => s.key === "close_job");
    expect(close?.confidence).toBe("high");
  });

  it("returns no close_job suggestion when invoice unpaid", () => {
    const out = nextSuggestions(InspectionStatus.IN_BILLING, {
      ...baseCtx,
      invoiceStatus: "ISSUED",
    });
    expect(out.map((s) => s.key)).not.toContain("close_job");
  });

  it("returns empty for terminal CLOSED state (no advance from here yet)", () => {
    const out = nextSuggestions(InspectionStatus.CLOSED, baseCtx);
    expect(out).toEqual([]);
  });
});

describe("TRANSITION_REQUIREMENTS export", () => {
  it("exposes the IN_BILLING → CLOSED precondition matrix for SP-B reuse", () => {
    expect(TRANSITION_REQUIREMENTS).toBeDefined();
    expect(TRANSITION_REQUIREMENTS.close_job).toBeDefined();
    expect(TRANSITION_REQUIREMENTS.close_job.required).toContain(
      "invoice_paid",
    );
    expect(TRANSITION_REQUIREMENTS.close_job.required).toContain("report_sent");
  });
});
