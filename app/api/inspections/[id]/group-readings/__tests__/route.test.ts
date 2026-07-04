import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindFirst = vi.fn();
const moistureReadingFindMany = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
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
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...args: unknown[]) => resolveWorkspaceAiKey(...args),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
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
  resolveWorkspaceAiKey.mockReset();
  groupReadings.mockReset();

  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  inspectionFindFirst.mockResolvedValue({ id: "inspection_1" });
  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "sk-ant-test",
  });
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
  it("returns 402 with the NoWorkspaceKeyError shape when the workspace has no key", async () => {
    // RA-6960 (BYOK) — a keyless workspace must get a hard 402 and the AI
    // grouper must never run on the platform ANTHROPIC_API_KEY.
    const { NoWorkspaceKeyError } = await import(
      "@/lib/ai/resolve-workspace-ai-key"
    );
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error.code).toBe("PAYMENT_REQUIRED");
    // The customer workload must never reach the provider on no key.
    expect(groupReadings).not.toHaveBeenCalled();
  });

  it("threads the resolved workspace key to the service on success", async () => {
    groupReadings.mockResolvedValueOnce({
      ok: true,
      data: {
        groups: [
          {
            name: "Kitchen",
            locations: ["Kitchen wall", "Kitchen floor"],
            readingIds: ["reading_1", "reading_2"],
            averageMoisture: 21,
            elevatedCount: 2,
          },
        ],
        unsortedReadingIds: [],
      },
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ id: "inspection_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.groups).toHaveLength(1);
    // RA-6960 (BYOK) — the workspace's own key resolved by resolveWorkspaceAiKey
    // is what the service runs on, never the platform ANTHROPIC_API_KEY.
    expect(groupReadings).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-ant-test" }),
    );
  });

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
