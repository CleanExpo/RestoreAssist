/**
 * RA-8589 — staff cancel an emailed signing link, or correct the email of an
 * unsigned signatory. Both switch the old link off. A signed row is untouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const instanceFindUnique = vi.fn();
const sigUpdateMany = vi.fn();
const sigFindFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormInstance: {
      findUnique: (...a: unknown[]) => instanceFindUnique(...a),
    },
    authorityFormSignature: {
      updateMany: (...a: unknown[]) => sigUpdateMany(...a),
      findFirst: (...a: unknown[]) => sigFindFirst(...a),
    },
  },
}));

import { PATCH } from "../route";

const ctx = (signatureId = "s_1") => ({
  params: Promise.resolve({ id: "f_1", signatureId }),
});
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/authority-forms/f_1/signatures/s_1", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const openForm = (status = "PENDING_SIGNATURES") => ({
  status,
  report: { userId: "u_1", assignedManagerId: null, assignedAdminId: null },
});

const CLEARED = {
  signatureRequestToken: null,
  signatureRequestSent: false,
  signatureRequestSentAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  instanceFindUnique.mockResolvedValue(openForm());
  sigUpdateMany.mockResolvedValue({ count: 1 });
  sigFindFirst.mockResolvedValue({ id: "s_1", signedAt: null });
});

describe("PATCH /api/authority-forms/:id/signatures/:signatureId (RA-8589)", () => {
  it("cancel clears the token so the old link reads as unknown", async () => {
    const res = await PATCH(req({ action: "cancel_request" }), ctx());
    expect(res.status).toBe(200);
    const { where, data } = sigUpdateMany.mock.calls[0][0];
    expect(data).toEqual(CLEARED);
    expect(where).toMatchObject({ id: "s_1", instanceId: "f_1" });
  });

  it("correcting the email stores it and stops the link already sent", async () => {
    const res = await PATCH(
      req({ signatoryEmail: "  Right.Person@Example.com " }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(sigUpdateMany.mock.calls[0][0].data).toEqual({
      ...CLEARED,
      signatoryEmail: "right.person@example.com",
    });
  });

  it("the write only matches an unsigned slot on an open form (RA-8400)", async () => {
    await PATCH(req({ action: "cancel_request" }), ctx());
    expect(sigUpdateMany.mock.calls[0][0].where).toMatchObject({
      signedAt: null,
      instance: { status: { notIn: ["CANCELLED", "COMPLETED"] } },
    });
  });

  it("a signed slot is refused with 409 and nothing else is written", async () => {
    sigUpdateMany.mockResolvedValueOnce({ count: 0 });
    sigFindFirst.mockResolvedValueOnce({ signedAt: new Date() });
    const res = await PATCH(req({ signatoryEmail: "a@b.co" }), ctx());
    expect(res.status).toBe(409);
    expect(sigUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("a completed form is refused before any write", async () => {
    instanceFindUnique.mockResolvedValueOnce(openForm("COMPLETED"));
    const res = await PATCH(req({ action: "cancel_request" }), ctx());
    expect(res.status).toBe(409);
    expect(sigUpdateMany).not.toHaveBeenCalled();
  });

  it("a signature on another form is not found", async () => {
    sigUpdateMany.mockResolvedValueOnce({ count: 0 });
    sigFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(req({ action: "cancel_request" }), ctx("foreign"));
    expect(res.status).toBe(404);
  });

  it("refuses a caller with no access to the form", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "intruder" } });
    const res = await PATCH(req({ action: "cancel_request" }), ctx());
    expect(res.status).toBe(403);
    expect(sigUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(req({ action: "cancel_request" }), ctx());
    expect(res.status).toBe(401);
  });

  it.each([
    ["bad email", { signatoryEmail: "not-an-email" }],
    ["unknown action", { action: "delete" }],
    ["extra field", { signatoryEmail: "a@b.co", signedAt: "2026-01-01" }],
    ["bad json", "{"],
  ])("rejects %s with 400 and no write", async (_label, body) => {
    const res = await PATCH(req(body), ctx());
    expect(res.status).toBe(400);
    expect(sigUpdateMany).not.toHaveBeenCalled();
  });
});
