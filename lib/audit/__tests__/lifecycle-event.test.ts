/**
 * SP-A Task 3 — Append-only lifecycle audit writer.
 *
 * Unit tests for hash determinism and idempotency. The actual DB writes
 * are mocked — integration coverage lives in the close-route tests
 * (Task 7) where the real Prisma transaction is exercised.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 3.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ClaimState } from "@prisma/client";

import {
  computeLifecycleIntegrityHash,
  writeLifecycleTransition,
} from "../lifecycle-event";

describe("computeLifecycleIntegrityHash", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeLifecycleIntegrityHash({
      claimProgressId: "cp_123",
      fromState: ClaimState.INVOICE_ISSUED,
      toState: ClaimState.CLOSED,
      actorUserId: "u_abc",
    });
    const b = computeLifecycleIntegrityHash({
      claimProgressId: "cp_123",
      fromState: ClaimState.INVOICE_ISSUED,
      toState: ClaimState.CLOSED,
      actorUserId: "u_abc",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any input changes", () => {
    const base = {
      claimProgressId: "cp_123",
      fromState: ClaimState.INVOICE_ISSUED,
      toState: ClaimState.CLOSED,
      actorUserId: "u_abc",
    } as const;
    const baseHash = computeLifecycleIntegrityHash(base);
    expect(
      computeLifecycleIntegrityHash({ ...base, claimProgressId: "cp_x" }),
    ).not.toBe(baseHash);
    expect(
      computeLifecycleIntegrityHash({
        ...base,
        toState: ClaimState.WITHDRAWN,
      }),
    ).not.toBe(baseHash);
    expect(
      computeLifecycleIntegrityHash({ ...base, actorUserId: "u_other" }),
    ).not.toBe(baseHash);
  });
});

describe("writeLifecycleTransition — DB interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes ProgressTransition + AuditLog rows within the supplied tx", async () => {
    const txMock = makeTxMock({ claimProgressFound: true });
    const out = await writeLifecycleTransition({
      inspectionId: "ins_1",
      fromState: ClaimState.INVOICE_ISSUED,
      toState: ClaimState.CLOSED,
      transitionKey: "close_job",
      actorUserId: "u_1",
      actorRole: "USER",
      actorName: "Alice Tradie",
      guardSnapshot: { softGaps: [], auditGaps: [] },
      auditAction: "JOB_CLOSED",
      prismaTx: txMock as any,
    });

    expect(out.id).toMatch(/^trans_/);
    expect(txMock.progressTransition.create).toHaveBeenCalledTimes(1);
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);

    const transCall = txMock.progressTransition.create.mock.calls[0][0];
    expect(transCall.data.claimProgressId).toBe("cp_existing");
    expect(transCall.data.fromState).toBe(ClaimState.INVOICE_ISSUED);
    expect(transCall.data.toState).toBe(ClaimState.CLOSED);
    expect(transCall.data.actorUserId).toBe("u_1");
    expect(transCall.data.transitionKey).toBe("close_job");
    expect(transCall.data.integrityHash).toMatch(/^[0-9a-f]{64}$/);

    const auditCall = txMock.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.inspectionId).toBe("ins_1");
    expect(auditCall.data.action).toBe("JOB_CLOSED");
    expect(auditCall.data.userId).toBe("u_1");
  });

  it("skips ProgressTransition but still writes AuditLog when ClaimProgress missing (legacy)", async () => {
    const txMock = makeTxMock({ claimProgressFound: false });
    const out = await writeLifecycleTransition({
      inspectionId: "ins_legacy",
      fromState: ClaimState.INVOICE_ISSUED,
      toState: ClaimState.CLOSED,
      transitionKey: "close_job",
      actorUserId: "u_1",
      actorRole: "USER",
      actorName: "Alice Tradie",
      guardSnapshot: {},
      auditAction: "JOB_CLOSED",
      prismaTx: txMock as any,
    });
    expect(out.id).toBeNull();
    expect(txMock.progressTransition.create).not.toHaveBeenCalled();
    expect(txMock.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

// ─── Test helpers ─────────────────────────────────────────────────────────

interface TxMockOptions {
  claimProgressFound: boolean;
}
function makeTxMock(opts: TxMockOptions) {
  return {
    claimProgress: {
      findUnique: vi.fn(async () =>
        opts.claimProgressFound ? { id: "cp_existing", reportId: "r_1" } : null,
      ),
      create: vi.fn(async () => ({ id: "cp_new", reportId: "r_new" })),
    },
    inspection: {
      findUnique: vi.fn(async () => ({
        id: "ins_legacy",
        reportId: null,
      })),
    },
    report: {
      create: vi.fn(async () => ({ id: "r_shim" })),
    },
    progressTransition: {
      create: vi.fn(async () => ({ id: "trans_xyz" })),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit_xyz" })),
    },
  };
}
