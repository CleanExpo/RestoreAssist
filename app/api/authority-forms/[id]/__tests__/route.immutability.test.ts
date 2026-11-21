/**
 * RA-8400 — PUT /api/authority-forms/:id must not change a signed form.
 *
 * Mocked Prisma: these tests prove the route refuses before writing and that
 * the write itself carries the guard. They do not run against a database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const instanceFindUnique = vi.fn();
const instanceUpdateMany = vi.fn();
const instanceUpdate = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorityFormInstance: {
      findUnique: (...args: unknown[]) => instanceFindUnique(...args),
      updateMany: (...args: unknown[]) => instanceUpdateMany(...args),
      update: (...args: unknown[]) => instanceUpdate(...args),
    },
  },
}));

import { PUT } from "../route";

const params = () => ({ params: Promise.resolve({ id: "form-1" }) });
function putReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/authority-forms/form-1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function form(status: string, signedAt: Date | null) {
  return {
    id: "form-1",
    status,
    authorityDescription: "Apply antimicrobial to the lounge carpet",
    report: { userId: "user-1", assignedManagerId: null, assignedAdminId: null },
    signatures: [{ signedAt }],
  };
}

beforeEach(() => {
  getServerSession.mockReset();
  instanceFindUnique.mockReset();
  instanceUpdateMany.mockReset();
  instanceUpdate.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
});

describe("PUT /api/authority-forms/:id (RA-8400)", () => {
  it("returns 409 and writes nothing when the wording changes after a signature", async () => {
    instanceFindUnique.mockResolvedValueOnce(
      form("PARTIALLY_SIGNED", new Date("2026-11-01T00:00:00Z")),
    );
    const res = await PUT(
      putReq({ authorityDescription: "Dispose of all contents" }),
      params(),
    );
    expect(res.status).toBe(409);
    expect(instanceUpdateMany).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
  });

  it("refuses status COMPLETED from the body", async () => {
    instanceFindUnique.mockResolvedValueOnce(form("PENDING_SIGNATURES", null));
    const res = await PUT(putReq({ status: "COMPLETED" }), params());
    expect(res.status).toBe(409);
    expect(instanceUpdateMany).not.toHaveBeenCalled();
    expect(instanceUpdate).not.toHaveBeenCalled();
  });

  it("refuses status PARTIALLY_SIGNED from the body", async () => {
    instanceFindUnique.mockResolvedValueOnce(form("DRAFT", null));
    const res = await PUT(putReq({ status: "PARTIALLY_SIGNED" }), params());
    expect(res.status).toBe(409);
    expect(instanceUpdateMany).not.toHaveBeenCalled();
  });

  it("edits the wording of an unsigned form, with the no-signature rule in the write", async () => {
    instanceFindUnique
      .mockResolvedValueOnce(form("PENDING_SIGNATURES", null))
      .mockResolvedValueOnce({ id: "form-1" });
    instanceUpdateMany.mockResolvedValueOnce({ count: 1 });
    const res = await PUT(
      putReq({ authorityDescription: "Corrected wording" }),
      params(),
    );
    expect(res.status).toBe(200);
    const where = instanceUpdateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: "form-1",
      status: "PENDING_SIGNATURES",
      signatures: { none: { signedAt: { not: null } } },
    });
  });

  it("returns 409 when a signature lands between the read and the write", async () => {
    instanceFindUnique.mockResolvedValueOnce(form("PENDING_SIGNATURES", null));
    instanceUpdateMany.mockResolvedValueOnce({ count: 0 });
    const res = await PUT(
      putReq({ authorityDescription: "Corrected wording" }),
      params(),
    );
    expect(res.status).toBe(409);
  });

  it("allows a draft to be cancelled", async () => {
    instanceFindUnique
      .mockResolvedValueOnce(form("DRAFT", null))
      .mockResolvedValueOnce({ id: "form-1", status: "CANCELLED" });
    instanceUpdateMany.mockResolvedValueOnce({ count: 1 });
    const res = await PUT(putReq({ status: "CANCELLED" }), params());
    expect(res.status).toBe(200);
    expect(instanceUpdateMany.mock.calls[0][0].data).toEqual({
      status: "CANCELLED",
    });
  });

  it("refuses to cancel a form that already carries a signature", async () => {
    // Staff signing leaves a PENDING_SIGNATURES form in that status, so a
    // signed slot can sit on a form whose status still looks open.
    instanceFindUnique.mockResolvedValueOnce(
      form("PENDING_SIGNATURES", new Date("2026-11-01T00:00:00Z")),
    );
    const res = await PUT(putReq({ status: "CANCELLED" }), params());
    expect(res.status).toBe(409);
    expect(instanceUpdateMany).not.toHaveBeenCalled();
  });

  it("puts the no-signature rule in the cancel write too", async () => {
    instanceFindUnique
      .mockResolvedValueOnce(form("DRAFT", null))
      .mockResolvedValueOnce({ id: "form-1", status: "CANCELLED" });
    instanceUpdateMany.mockResolvedValueOnce({ count: 1 });
    await PUT(putReq({ status: "CANCELLED" }), params());
    expect(instanceUpdateMany.mock.calls[0][0].where).toMatchObject({
      signatures: { none: { signedAt: { not: null } } },
    });
  });
});
