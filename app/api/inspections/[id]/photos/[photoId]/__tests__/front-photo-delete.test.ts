/**
 * RA-8498: a photo that is a site visit's front-of-property photo cannot be
 * deleted on its own. The route answers 409 in words before the database's
 * NO ACTION key would turn the delete into a server error, and deletes
 * nothing (the row, the stored file and the audit trail are untouched).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { expectRefused } from "@/tests/helpers/expect-refused";

const m = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  inspectionFindFirst: vi.fn(),
  photoFindFirst: vi.fn(),
  photoDelete: vi.fn(),
  visitFindMany: vi.fn(),
  auditCreate: vi.fn(),
  userFindUnique: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({ delete: m.storageDelete }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: m.inspectionFindFirst },
    inspectionPhoto: { findFirst: m.photoFindFirst, delete: m.photoDelete },
    siteVisit: { findMany: m.visitFindMany },
    auditLog: { create: m.auditCreate },
    user: { findUnique: m.userFindUnique },
  },
}));

import { DELETE } from "../route";

const del = () =>
  DELETE(new NextRequest("http://localhost/api/inspections/i1/photos/ph1", { method: "DELETE" }), {
    params: Promise.resolve({ id: "i1", photoId: "ph1" }),
  });

describe("photos/[photoId] DELETE and the site visit front photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getServerSession.mockResolvedValue({ user: { id: "u1" } });
    m.inspectionFindFirst.mockResolvedValue({ id: "i1" });
    m.photoFindFirst.mockResolvedValue({ id: "ph1", url: "https://res.cloudinary.com/x/image/upload/v1/a.jpg" });
    m.photoDelete.mockResolvedValue({});
    m.userFindUnique.mockResolvedValue({ organizationId: "org1" });
    m.auditCreate.mockResolvedValue({});
  });

  it("refuses 409 and deletes nothing when a visit uses the photo", async () => {
    m.visitFindMany.mockResolvedValue([{ visitNumber: 2 }]);
    const res = await del();
    await expectRefused(res, 409, /front of property photo for visit 2/);
    expect(m.photoDelete).not.toHaveBeenCalled();
    expect(m.storageDelete).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
    // The lookup is keyed to this job and this photo.
    expect(m.visitFindMany.mock.calls[0][0].where).toEqual({ inspectionId: "i1", frontPhotoId: "ph1" });
  });

  it("deletes as before when no visit uses the photo (the refusal can say yes)", async () => {
    m.visitFindMany.mockResolvedValue([]);
    const res = await del();
    expect(res.status).toBe(200);
    expect(m.photoDelete).toHaveBeenCalledWith({ where: { id: "ph1" } });
  });

  it("answers 409, not 500, when the database key refuses a delete that raced a visit update", async () => {
    m.visitFindMany.mockResolvedValue([]);
    m.photoDelete.mockRejectedValue(Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" }));
    const res = await del();
    await expectRefused(res, 409, /Foreign key constraint/);
    expect(m.storageDelete).not.toHaveBeenCalled();
  });
});
