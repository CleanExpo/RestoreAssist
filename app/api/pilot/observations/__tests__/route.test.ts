import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.hoisted(() => vi.fn());
const inspectionFindFirst = vi.hoisted(() => vi.fn());
const pilotObservationCreate = vi.hoisted(() => vi.fn());
const pilotObservationFindMany = vi.hoisted(() => vi.fn());
const verifyAdminFromDb = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-auth", () => ({ verifyAdminFromDb }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: inspectionFindFirst },
    pilotObservation: {
      create: pilotObservationCreate,
      findMany: pilotObservationFindMany,
    },
  },
}));

import { POST } from "../route";

const body = {
  claimId: "CLAIM-004",
  observationType: "adjuster_session",
  value: 32,
  group: "nir",
  inspectionId: "inspection-1",
};

function request(origin: string | null = "http://localhost") {
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost/api/pilot/observations", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  inspectionFindFirst.mockResolvedValue({ id: "inspection-1" });
  pilotObservationCreate.mockResolvedValue({
    id: "observation-1",
    ...body,
    recordedByUserId: "user-1",
    createdAt: new Date("2026-08-25T00:00:00.000Z"),
  });
  pilotObservationFindMany.mockResolvedValue([]);
  verifyAdminFromDb.mockResolvedValue({ response: null });
});

describe("POST /api/pilot/observations", () => {
  it("rejects missing Origin before auth or observation work", async () => {
    const response = await POST(request(null));
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(inspectionFindFirst).not.toHaveBeenCalled();
    expect(pilotObservationCreate).not.toHaveBeenCalled();
  });

  it("rejects hostile Origin before auth or observation work", async () => {
    const response = await POST(request("http://evil.test"));
    expect(response.status).toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(inspectionFindFirst).not.toHaveBeenCalled();
    expect(pilotObservationCreate).not.toHaveBeenCalled();
  });

  it("accepts valid Origin and preserves auth, inspection ownership, and create checks", async () => {
    const response = await POST(request("http://localhost"));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.observation.id).toBe("observation-1");
    expect(getServerSession).toHaveBeenCalled();
    expect(inspectionFindFirst).toHaveBeenCalledWith({
      where: { id: "inspection-1", userId: "user-1" },
      select: { id: true },
    });
    expect(pilotObservationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        claimId: "CLAIM-004",
        observationType: "adjuster_session",
        recordedByUserId: "user-1",
      }),
    }));
  });
});
