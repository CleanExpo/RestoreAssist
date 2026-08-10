import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetServerSession = vi.fn();
const mockInspectionFindFirst = vi.fn();
const mockPhotoFindFirst = vi.fn();
const mockPhotoDelete = vi.fn();
const mockPhotoUpdate = vi.fn();
const mockAuditCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockStorageDelete = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: async () => ({
    delete: (...a: unknown[]) => mockStorageDelete(...a),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: (...a: unknown[]) => mockInspectionFindFirst(...a),
    },
    inspectionPhoto: {
      findFirst: (...a: unknown[]) => mockPhotoFindFirst(...a),
      delete: (...a: unknown[]) => mockPhotoDelete(...a),
      update: (...a: unknown[]) => mockPhotoUpdate(...a),
    },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}));

import { DELETE, PATCH } from "../route";

describe("photos/[photoId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockInspectionFindFirst.mockResolvedValue({ id: "i1" });
    mockUserFindUnique.mockResolvedValue({ organizationId: "org1" });
    mockAuditCreate.mockResolvedValue({});
  });

  it("DELETE removes the photo row", async () => {
    mockPhotoFindFirst.mockResolvedValue({
      id: "ph1",
      url: "https://res.cloudinary.com/demo/image/upload/v1/inspections/i1/a.jpg",
    });
    mockPhotoDelete.mockResolvedValue({});
    mockStorageDelete.mockResolvedValue(undefined);

    const req = new NextRequest(
      "http://localhost:3001/api/inspections/i1/photos/ph1",
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: "i1", photoId: "ph1" }),
    });
    expect(res.status).toBe(200);
    expect(mockPhotoDelete).toHaveBeenCalled();
  });

  it("PATCH updates caption fields", async () => {
    mockPhotoFindFirst.mockResolvedValue({ id: "ph1" });
    mockPhotoUpdate.mockResolvedValue({
      id: "ph1",
      location: "Kitchen",
      description: "Kitchen",
    });
    const req = new NextRequest(
      "http://localhost:3001/api/inspections/i1/photos/ph1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: "Kitchen", description: "Kitchen" }),
      },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "i1", photoId: "ph1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.photo.location).toBe("Kitchen");
  });
});
