import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const moistureReadingFindMany = vi.fn();
const groupReadings = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    inspection: {
      findFirst: (...args: unknown[]) => inspectionFindFirst(...args),
    },
    moistureReading: {
      findMany: (...args: unknown[]) => moistureReadingFindMany(...args),
    },
  },
}));
vi.mock("@/lib/services/ai/group-readings", () => ({
  groupReadings: (...args: unknown[]) => groupReadings(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  inspectionFindFirst.mockReset();
  moistureReadingFindMany.mockReset();
  groupReadings.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  inspectionFindFirst.mockResolvedValue({ id: "inspection_1" });
  moistureReadingFindMany.mockResolvedValue([
    {
      id: "reading_1",
      location: "Kitchen wall",
      surfaceType: "Gyprock",
      moistureLevel: 24,
      depth: null,
    },
    {
      id: "reading_2",
      location: "Kitchen floor",
      surfaceType: "Timber",
      moistureLevel: 18,
      depth: null,
    },
  ]);
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/group-readings",
    { method: "POST" },
  );
}

describe("POST /api/inspections/[id]/group-readings", () => {
  it("does not expose provider failure details", async () => {
    groupReadings.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "API_ERROR" });
  });
});
