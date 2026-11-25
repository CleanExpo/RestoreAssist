/**
 * RA-8526 — DELETE /api/reports/[id] must not erase a signed authority form.
 *
 * AuthorityFormInstance is onDelete: Cascade from Report, so deleting the
 * report deletes its forms and the client's signatures with it. A report that
 * holds a signed form is refused with 409. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

const db = vi.hoisted(() => ({
  report: {
    findFirst: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  authorityFormInstance: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { getServerSession } from "next-auth";
import { DELETE } from "../route";

function del() {
  return DELETE(
    new NextRequest("http://localhost/api/reports/r1", { method: "DELETE" }),
    { params: Promise.resolve({ id: "r1" }) },
  );
}

describe("DELETE /api/reports/[id] with a signed authority form (RA-8526)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1" } } as never);
    db.report.findFirst.mockResolvedValue({ id: "r1", userId: "u1" });
    db.report.delete.mockResolvedValue({ id: "r1" });
    db.report.deleteMany.mockResolvedValue({ count: 1 });
    db.authorityFormInstance.findMany.mockResolvedValue([]);
  });

  it("refuses with 409 and deletes nothing when the report holds a signed form", async () => {
    db.authorityFormInstance.findMany.mockResolvedValue([{ reportId: "r1" }]);
    const res = await del();
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/signed authority form/);
    expect(db.report.delete).not.toHaveBeenCalled();
    expect(db.report.deleteMany).not.toHaveBeenCalled();
    expect(db.authorityFormInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          report: { id: "r1", userId: "u1" },
          signatures: { some: { signedAt: { not: null } } },
        },
      }),
    );
  });

  it("deletes an unsigned report with the unsigned rule in the delete itself", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(db.report.delete).not.toHaveBeenCalled();
    expect(db.report.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "r1",
        userId: "u1",
        authorityForms: {
          none: { signatures: { some: { signedAt: { not: null } } } },
        },
      },
    });
  });

  it("refuses with 409 when a signature lands between the check and the delete", async () => {
    db.report.deleteMany.mockResolvedValue({ count: 0 });
    const res = await del();
    expect(res.status).toBe(409);
  });
});
