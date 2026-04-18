import { describe, it, expect } from "vitest";
import { certifyDryingGuard } from "../drying";
import {
  initiateCloseoutGuard,
  issueInvoiceGuard,
  recordPaymentGuard,
} from "../invoice";
import { closeClaimGuard } from "../dispute";
import type { GuardContext } from "../types";

function ctx(overrides: Partial<GuardContext> = {}): GuardContext {
  return {
    claimProgressId: "cp_1",
    reportId: "r_1",
    inspectionId: "i_1",
    fromState: "DRYING_ACTIVE",
    toState: "DRYING_CERTIFIED",
    key: "certify_drying",
    ...overrides,
  };
}

// ── certify_drying ──────────────────────────────────────────────────────────

describe("certifyDryingGuard", () => {
  function db(opts: {
    goalRecord?: {
      id: string;
      goalAchieved: boolean;
      signedOffBy: string | null;
      signedOffAt: Date | null;
    } | null;
    baselineCount?: number;
    monitoringCount?: number;
  }) {
    return {
      dryingGoalRecord: {
        findFirst: async () =>
          opts.goalRecord === undefined
            ? {
                id: "g_1",
                goalAchieved: true,
                signedOffBy: "u_senior",
                signedOffAt: new Date(),
              }
            : opts.goalRecord,
      },
      moistureReading: {
        count: async (q: {
          where: {
            inspectionId: string;
            isBaseline?: boolean;
            isMonitoringPoint?: boolean;
          };
        }) => {
          if (q.where.isBaseline) return opts.baselineCount ?? 1;
          if (q.where.isMonitoringPoint) return opts.monitoringCount ?? 1;
          return 0;
        },
      },
    };
  }

  it("passes with goal achieved, signed off, and baseline + monitoring readings", async () => {
    const res = await certifyDryingGuard(db({}), ctx());
    expect(res.passed).toBe(true);
  });

  it("fails when no DryingGoalRecord exists", async () => {
    const res = await certifyDryingGuard(db({ goalRecord: null }), ctx());
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("DryingGoalRecord");
  });

  it("fails when goal not achieved", async () => {
    const res = await certifyDryingGuard(
      db({
        goalRecord: {
          id: "g_1",
          goalAchieved: false,
          signedOffBy: "u",
          signedOffAt: new Date(),
        },
      }),
      ctx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("goalAchieved");
  });

  it("fails when not signed off", async () => {
    const res = await certifyDryingGuard(
      db({
        goalRecord: {
          id: "g_1",
          goalAchieved: true,
          signedOffBy: null,
          signedOffAt: null,
        },
      }),
      ctx(),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("signed off");
  });

  it("fails when no baseline reading exists", async () => {
    const res = await certifyDryingGuard(db({ baselineCount: 0 }), ctx());
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("baseline");
  });

  it("fails when no monitoring-point reading exists", async () => {
    const res = await certifyDryingGuard(db({ monitoringCount: 0 }), ctx());
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("monitoring-point");
  });
});

// ── initiate_closeout ───────────────────────────────────────────────────────

describe("initiateCloseoutGuard", () => {
  function db(opts: {
    pendingVariations?: Array<{ id: string }>;
    openWhs?: Array<{ id: string; severity: string }>;
  }) {
    return {
      scopeVariation: {
        findMany: async () => opts.pendingVariations ?? [],
      },
      wHSIncident: {
        findMany: async () => opts.openWhs ?? [],
      },
    };
  }

  it("passes with no pending variations and no open WHS", async () => {
    const res = await initiateCloseoutGuard(
      db({}),
      ctx({ key: "initiate_closeout" }),
    );
    expect(res.passed).toBe(true);
  });

  it("fails if any ScopeVariation is PENDING", async () => {
    const res = await initiateCloseoutGuard(
      db({ pendingVariations: [{ id: "sv_1" }] }),
      ctx({ key: "initiate_closeout" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("PENDING");
  });

  it("fails if any HIGH/CRITICAL WHS is open", async () => {
    const res = await initiateCloseoutGuard(
      db({ openWhs: [{ id: "w_1", severity: "HIGH" }] }),
      ctx({ key: "initiate_closeout" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("WHSIncident");
  });
});

// ── issue_invoice ───────────────────────────────────────────────────────────

describe("issueInvoiceGuard", () => {
  function db(
    invoice: {
      id: string;
      status: string;
      subtotalExGST: number;
      gstAmount: number;
      totalIncGST: number;
    } | null,
  ) {
    return {
      invoice: {
        findFirst: async () => invoice,
      },
    };
  }

  it("passes with a SENT invoice and consistent GST totals", async () => {
    const res = await issueInvoiceGuard(
      db({
        id: "inv_1",
        status: "SENT",
        subtotalExGST: 1000,
        gstAmount: 100,
        totalIncGST: 1100,
      }),
      ctx({ key: "issue_invoice" }),
    );
    expect(res.passed).toBe(true);
  });

  it("fails when no SENT invoice exists", async () => {
    const res = await issueInvoiceGuard(
      db(null),
      ctx({ key: "issue_invoice" }),
    );
    expect(res.passed).toBe(false);
  });

  it("fails when totals don't add up", async () => {
    const res = await issueInvoiceGuard(
      db({
        id: "inv_1",
        status: "SENT",
        subtotalExGST: 1000,
        gstAmount: 50, // should be 100 at 10%
        totalIncGST: 1100,
      }),
      ctx({ key: "issue_invoice" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("inconsistent");
  });

  it("allows 1-cent rounding tolerance", async () => {
    const res = await issueInvoiceGuard(
      db({
        id: "inv_1",
        status: "SENT",
        subtotalExGST: 1000.01,
        gstAmount: 99.99, // 0.01 cent diff
        totalIncGST: 1100,
      }),
      ctx({ key: "issue_invoice" }),
    );
    expect(res.passed).toBe(true);
  });
});

// ── record_payment ──────────────────────────────────────────────────────────

describe("recordPaymentGuard", () => {
  function db(opts: {
    invoice?: {
      id: string;
      status: string;
      amountDue: number;
      totalIncGST: number;
    } | null;
    paymentCount?: number;
  }) {
    return {
      invoice: {
        findFirst: async () =>
          opts.invoice === undefined
            ? { id: "inv_1", status: "PAID", amountDue: 0, totalIncGST: 1100 }
            : opts.invoice,
      },
      invoicePayment: {
        count: async () => opts.paymentCount ?? 1,
      },
    };
  }

  it("passes with PAID invoice + at least one payment", async () => {
    const res = await recordPaymentGuard(
      db({}),
      ctx({ key: "record_payment" }),
    );
    expect(res.passed).toBe(true);
  });

  it("fails when no invoice", async () => {
    const res = await recordPaymentGuard(
      db({ invoice: null }),
      ctx({ key: "record_payment" }),
    );
    expect(res.passed).toBe(false);
  });

  it("fails when invoice not PAID and amountDue > 0", async () => {
    const res = await recordPaymentGuard(
      db({
        invoice: {
          id: "inv_1",
          status: "SENT",
          amountDue: 500,
          totalIncGST: 1100,
        },
        paymentCount: 0,
      }),
      ctx({ key: "record_payment" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("not settled");
  });

  it("fails when no InvoicePayment row exists even if invoice marked PAID", async () => {
    const res = await recordPaymentGuard(
      db({ paymentCount: 0 }),
      ctx({ key: "record_payment" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("InvoicePayment");
  });
});

// ── close_claim ─────────────────────────────────────────────────────────────

describe("closeClaimGuard", () => {
  function db(opts: {
    invoiceStatus?: string;
    pendingVariations?: number;
    openWhs?: number;
  }) {
    return {
      invoice: {
        findFirst: async () => ({
          id: "inv_1",
          status: opts.invoiceStatus ?? "PAID",
          amountDue: 0,
        }),
      },
      scopeVariation: {
        count: async () => opts.pendingVariations ?? 0,
      },
      wHSIncident: {
        count: async () => opts.openWhs ?? 0,
      },
    };
  }

  it("passes with PAID invoice + no variations + no WHS open", async () => {
    const res = await closeClaimGuard(db({}), ctx({ key: "close_claim" }));
    expect(res.passed).toBe(true);
  });

  it("fails when invoice not PAID", async () => {
    const res = await closeClaimGuard(
      db({ invoiceStatus: "SENT" }),
      ctx({ key: "close_claim" }),
    );
    expect(res.passed).toBe(false);
  });

  it("fails when variations still pending", async () => {
    const res = await closeClaimGuard(
      db({ pendingVariations: 1 }),
      ctx({ key: "close_claim" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("PENDING");
  });

  it("fails when WHS still open", async () => {
    const res = await closeClaimGuard(
      db({ openWhs: 1 }),
      ctx({ key: "close_claim" }),
    );
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("WHSIncident");
  });
});
