import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindUnique = vi.fn();
const assertInspectionTenancy = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const classifyInspection = vi.fn();

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
      findUnique: (...args: unknown[]) => inspectionFindUnique(...args),
    },
  },
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: (...args: unknown[]) =>
    assertInspectionTenancy(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/services/ai/classify-inspection", () => ({
  classifyInspection: (...args: unknown[]) => classifyInspection(...args),
}));

import { POST } from "../route";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  userFindUnique.mockReset();
  inspectionFindUnique.mockReset();
  assertInspectionTenancy.mockReset();
  resolveWorkspaceAiKey.mockReset();
  classifyInspection.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({
    id: "user_1",
    subscriptionStatus: "ACTIVE",
  });
  assertInspectionTenancy.mockResolvedValue({ ok: true });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "sk-ant-test",
  });
  inspectionFindUnique.mockResolvedValue({
    id: "inspection_1",
    inspectionNumber: "INS-001",
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
    moistureReadings: [
      {
        location: "Kitchen",
        surfaceType: "Gyprock",
        moistureLevel: 24,
        depth: null,
        unit: "%MC",
        notes: null,
      },
    ],
    affectedAreas: [],
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/classify",
    { method: "POST" },
  );
}

describe("POST /api/inspections/[id]/classify", () => {
  it("does not expose provider failure details", async () => {
    classifyInspection.mockResolvedValueOnce({
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
