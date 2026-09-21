/**
 * RA-7610: a free-text-only reading with no SketchRoom still saves.
 * Location stays required; sketchRoomId is optional.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const inspectionFindFirst = vi.fn();
const moistureCreate = vi.fn();
const auditCreate = vi.fn();
const sketchRoomFindFirst = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    moistureReading: { create: (...a: unknown[]) => moistureCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
    sketchRoom: { findFirst: (...a: unknown[]) => sketchRoomFindFirst(...a) },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async (
    request: NextRequest,
    _userId: string,
    handler: (body: string) => Promise<Response>,
  ) => handler(await request.text()),
}));

import { POST } from "../route";

const params = Promise.resolve({ id: "insp_1" });

function postRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/inspections/insp_1/moisture", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  inspectionFindFirst.mockResolvedValue({ id: "insp_1", workspaceId: null });
  moistureCreate.mockImplementation(async ({ data }: { data: object }) => ({
    id: "mr_1",
    ...data,
  }));
  auditCreate.mockResolvedValue({ id: "audit_1" });
});

describe("POST /api/inspections/[id]/moisture — RA-7610 free-text fallback", () => {
  it("saves a free-text-only reading with no room", async () => {
    const response = await POST(
      postRequest({
        location: "Subfloor — not on the plan",
        surfaceType: "timber",
        moistureLevel: 19.2,
        depth: "Surface",
      }),
      { params },
    );

    expect(response.status).toBe(201);
    expect(moistureCreate).toHaveBeenCalledTimes(1);
    const written = moistureCreate.mock.calls[0][0].data as {
      location: string;
      sketchRoomId?: string | null;
    };
    expect(written.location).toBe("Subfloor — not on the plan");
    expect(written.sketchRoomId ?? null).toBeNull();
  });
});
