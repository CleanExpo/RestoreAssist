/**
 * xero-integration.test.ts — M-11 (RA-1387)
 *
 * Locks the Progress-transition → Xero dispatcher. Verifies:
 *   - Correct delegate method picked per transitionKey
 *   - All other transitionKeys are no-op fast returns (no delegate calls)
 *   - Missing reportId + inspectionId short-circuits with a specific reason
 *   - Idempotency key derived from `${transition.id}:xero`
 *   - Delegate throws are caught + returned as `ok: false` (rule 13 fire-and-forget)
 *   - Every reason string is non-empty (principle 3)
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleProgressTransitionForXero,
  isXeroRelevant,
  type XeroDelegate,
  type TransitionRow,
  type ClaimProgressRow,
} from "../integrations/xero";

function makeDelegate(): XeroDelegate & {
  createInvoice: ReturnType<typeof vi.fn>;
  recordPayment: ReturnType<typeof vi.fn>;
  appendDisputeMemo: ReturnType<typeof vi.fn>;
} {
  return {
    createInvoice: vi.fn().mockResolvedValue({ ok: true, reason: "invoice created" }),
    recordPayment: vi.fn().mockResolvedValue({ ok: true, reason: "payment recorded" }),
    appendDisputeMemo: vi.fn().mockResolvedValue({ ok: true, reason: "memo appended" }),
  };
}

function makeTransition(transitionKey: string, id = "tx_123"): TransitionRow {
  return {
    id,
    transitionKey,
    actorUserId: "user_admin",
    fromState: "CLOSEOUT",
    toState: "INVOICE_ISSUED",
    createdAt: new Date("2026-04-18T06:00:00Z"),
  };
}

function makeClaim(overrides: Partial<ClaimProgressRow> = {}): ClaimProgressRow {
  return {
    id: "cp_1",
    reportId: "rep_42",
    inspectionId: null,
    state: "CLOSEOUT",
    carrierVariationThresholdPercent: null,
    ...overrides,
  };
}

describe("isXeroRelevant", () => {
  it("matches the documented dispatch set", () => {
    expect(isXeroRelevant("issue_invoice")).toBe(true);
    expect(isXeroRelevant("record_payment")).toBe(true);
    expect(isXeroRelevant("dispute")).toBe(true);
    // Not in set — no-op
    expect(isXeroRelevant("attest_stabilisation")).toBe(false);
    expect(isXeroRelevant("submit_scope")).toBe(false);
    expect(isXeroRelevant("close")).toBe(false);
    expect(isXeroRelevant("gibberish")).toBe(false);
  });
});

describe("handleProgressTransitionForXero — dispatch", () => {
  it("issue_invoice → delegate.createInvoice called with idempotency key", async () => {
    const delegate = makeDelegate();
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("issue_invoice", "tx_abc"),
      claimProgress: makeClaim(),
      xeroDelegate: delegate,
    });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("create_invoice");
    expect(result.idempotencyKey).toBe("tx_abc:xero");
    expect(delegate.createInvoice).toHaveBeenCalledOnce();
    expect(delegate.createInvoice).toHaveBeenCalledWith({
      reportId: "rep_42",
      inspectionId: null,
      actorUserId: "user_admin",
      idempotencyKey: "tx_abc:xero",
    });
    expect(delegate.recordPayment).not.toHaveBeenCalled();
    expect(delegate.appendDisputeMemo).not.toHaveBeenCalled();
  });

  it("record_payment → delegate.recordPayment only", async () => {
    const delegate = makeDelegate();
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("record_payment"),
      claimProgress: makeClaim(),
      xeroDelegate: delegate,
    });
    expect(result.action).toBe("record_payment");
    expect(delegate.recordPayment).toHaveBeenCalledOnce();
    expect(delegate.createInvoice).not.toHaveBeenCalled();
  });

  it("dispute → delegate.appendDisputeMemo only", async () => {
    const delegate = makeDelegate();
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("dispute"),
      claimProgress: makeClaim(),
      xeroDelegate: delegate,
    });
    expect(result.action).toBe("append_dispute_memo");
    expect(delegate.appendDisputeMemo).toHaveBeenCalledOnce();
  });
});

describe("handleProgressTransitionForXero — no-op fast path", () => {
  it.each([
    ["attest_stabilisation"],
    ["attest_whs_hazard"],
    ["submit_scope"],
    ["carrier_authorise"],
    ["commence_drying"],
    ["certify_drying"],
    ["commence_closeout"],
    ["close"],
    ["withdraw"],
    ["unknown_key"],
  ])("transitionKey=%s → noop, zero delegate calls", async (key) => {
    const delegate = makeDelegate();
    const result = await handleProgressTransitionForXero({
      transition: makeTransition(key),
      claimProgress: makeClaim(),
      xeroDelegate: delegate,
    });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("noop");
    expect(result.reason).toMatch(/no Xero action required/i);
    expect(delegate.createInvoice).not.toHaveBeenCalled();
    expect(delegate.recordPayment).not.toHaveBeenCalled();
    expect(delegate.appendDisputeMemo).not.toHaveBeenCalled();
  });
});

describe("handleProgressTransitionForXero — defensive guards", () => {
  it("returns error if claim has neither reportId nor inspectionId", async () => {
    const delegate = makeDelegate();
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("issue_invoice"),
      claimProgress: makeClaim({ reportId: null, inspectionId: null }),
      xeroDelegate: delegate,
    });
    expect(result.ok).toBe(false);
    expect(result.action).toBe("error");
    expect(result.reason).toMatch(/neither reportId nor inspectionId/i);
    expect(delegate.createInvoice).not.toHaveBeenCalled();
  });

  it("proceeds when only inspectionId is present", async () => {
    const delegate = makeDelegate();
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("issue_invoice"),
      claimProgress: makeClaim({ reportId: null, inspectionId: "ins_9" }),
      xeroDelegate: delegate,
    });
    expect(result.ok).toBe(true);
    expect(delegate.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ inspectionId: "ins_9", reportId: null }),
    );
  });

  it("rule 13: delegate throw is caught, returns ok:false with reason", async () => {
    const delegate = makeDelegate();
    delegate.createInvoice.mockRejectedValue(new Error("Xero 500 — try again later"));
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("issue_invoice"),
      claimProgress: makeClaim(),
      xeroDelegate: delegate,
    });
    expect(result.ok).toBe(false);
    expect(result.action).toBe("error");
    expect(result.reason).toMatch(/Xero delegate threw/i);
    expect(result.reason).toMatch(/Xero 500/);
    // Still returned an idempotency key so the caller can log + retry
    expect(result.idempotencyKey).toBe("tx_123:xero");
  });

  it("forwards delegate ok:false with its reason intact", async () => {
    const delegate = makeDelegate();
    delegate.recordPayment.mockResolvedValue({
      ok: false,
      reason: "Payment already recorded (idempotency replay).",
    });
    const result = await handleProgressTransitionForXero({
      transition: makeTransition("record_payment"),
      claimProgress: makeClaim(),
      xeroDelegate: delegate,
    });
    expect(result.ok).toBe(false);
    expect(result.action).toBe("record_payment");
    expect(result.reason).toMatch(/already recorded/i);
  });
});

describe("handleProgressTransitionForXero — reason strings (principle 3)", () => {
  it("every returned reason is non-empty", async () => {
    const delegate = makeDelegate();
    const keys = [
      "issue_invoice",
      "record_payment",
      "dispute",
      "noop_example",
    ];
    for (const key of keys) {
      const r = await handleProgressTransitionForXero({
        transition: makeTransition(key),
        claimProgress: makeClaim(),
        xeroDelegate: delegate,
      });
      expect(r.reason.length, `key=${key}`).toBeGreaterThan(0);
    }
  });
});
