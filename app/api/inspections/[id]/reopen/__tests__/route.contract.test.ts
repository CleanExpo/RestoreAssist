import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// STORM T3 — admin inspection reopen (Sandra, admin/owner).
// Locks the reopen guards AND the *honest* void-invoice contract: when
// voidInvoice=true is passed but Stripe reversal is unimplemented, the response
// must surface invoiceVoided:false WITH an explicit warning — never silently
// imply the invoice was voided.

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const verifyAdminFromDb = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  verifyAdminFromDb: (...a: unknown[]) => verifyAdminFromDb(...a),
}));

const canTransition = vi.fn();
vi.mock("@/lib/lifecycle/inspection-state-machine", () => ({
  canTransition: (...a: unknown[]) => canTransition(...a),
}));

const writeLifecycleTransition = vi.fn();
vi.mock("@/lib/audit/lifecycle-event", () => ({
  writeLifecycleTransition: (...a: unknown[]) => writeLifecycleTransition(...a),
}));

const inspectionFindUnique = vi.fn();
const txInspectionUpdateMany = vi.fn();
const txClaimProgressUpdateMany = vi.fn();
const $transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    inspection: { updateMany: (...a: unknown[]) => txInspectionUpdateMany(...a) },
    claimProgress: { updateMany: (...a: unknown[]) => txClaimProgressUpdateMany(...a) },
  }),
);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => inspectionFindUnique(...a) },
    $transaction: (...a: unknown[]) => ($transaction as (...x: unknown[]) => unknown)(...a),
  },
}));

import { POST } from "../route";

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/inspections/i_1/reopen", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: "i_1" }) };
const REASON = "Reopening to correct a wrongly-closed claim for finance.";

beforeEach(() => {
  getServerSession.mockReset();
  verifyAdminFromDb.mockReset();
  canTransition.mockReset();
  writeLifecycleTransition.mockReset();
  inspectionFindUnique.mockReset();
  txInspectionUpdateMany.mockReset();
  txClaimProgressUpdateMany.mockReset();
  // Default: caller is a verified admin.
  getServerSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
  verifyAdminFromDb.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
});

describe("POST /api/inspections/[id]/reopen", () => {
  it("returns 422 when the reason is too short", async () => {
    const res = await POST(postReq({ reason: "too short" }), ctx);
    expect(res.status).toBe(422);
  });

  it("returns 404 when the inspection does not exist", async () => {
    inspectionFindUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ reason: REASON }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the inspection is not in a terminal state", async () => {
    inspectionFindUnique.mockResolvedValueOnce({ id: "i_1", status: "DRAFT" });
    const res = await POST(postReq({ reason: REASON }), ctx);
    expect(res.status).toBe(409);
  });

  it("reopens a CLOSED inspection to IN_BILLING on success", async () => {
    inspectionFindUnique.mockResolvedValueOnce({ id: "i_1", status: "CLOSED" });
    canTransition.mockReturnValueOnce({ ok: true });
    txInspectionUpdateMany.mockResolvedValueOnce({ count: 1 });
    writeLifecycleTransition.mockResolvedValueOnce({ id: "t_1" });
    txClaimProgressUpdateMany.mockResolvedValueOnce({});

    const res = await POST(postReq({ reason: REASON }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.newStatus).toBe("IN_BILLING");
    expect(json.data).not.toHaveProperty("invoiceVoided");
    // Compare-and-swap guard: the status write must be conditional on the
    // previous status so two concurrent reopens can't both succeed.
    expect(txInspectionUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: "i_1",
      status: "CLOSED",
    });
  });

  it("is honest when voidInvoice=true but reversal is unimplemented", async () => {
    inspectionFindUnique.mockResolvedValueOnce({ id: "i_1", status: "CLOSED" });
    canTransition.mockReturnValueOnce({ ok: true });
    txInspectionUpdateMany.mockResolvedValueOnce({ count: 1 });
    writeLifecycleTransition.mockResolvedValueOnce({ id: "t_1" });
    txClaimProgressUpdateMany.mockResolvedValueOnce({});

    const res = await POST(postReq({ reason: REASON, voidInvoice: true }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    // The contract must not pretend the invoice was voided.
    expect(json.data.invoiceVoided).toBe(false);
    expect(json.data.warning).toMatch(/not yet implemented/i);
  });
});
