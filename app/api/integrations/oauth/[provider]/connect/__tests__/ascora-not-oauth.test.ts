/**
 * Ascora is not an OAuth provider — the generic connect route must refuse it.
 *
 * The removed shortcut marked the Integration row CONNECTED purely because
 * ASCORA_API_KEY was present in the environment: no entitlement check, no
 * proof the key worked, and no per-user credential. These tests pin the
 * replacement contract:
 *   - ASCORA is rejected with a 4xx that points at /api/ascora/connect,
 *   - env presence alone can never produce a "connected" answer,
 *   - no Integration row is created or updated by the rejected attempt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (_req: NextRequest, _userId: string, fn: () => Promise<Response>) =>
      fn(),
  ),
}));
vi.mock("@/lib/integrations/subscription-guard", () => ({
  checkIntegrationAccess: vi.fn(async () => ({ isAllowed: true })),
  createSubscriptionRequiredResponse: vi.fn(),
}));
vi.mock("@/lib/integrations/dev-mode", () => ({
  isIntegrationDevMode: vi.fn(() => false),
}));
vi.mock("@/lib/integrations", () => ({
  getProviderAuthUrl: vi.fn(() => "https://provider.example/authorize"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    oAuthStateNonce: { create: vi.fn() },
  },
}));
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(async () => ({
    allowed: true,
    sku: "BOOKKEEPING",
    workspaceId: "ws_1",
  })),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const integrationMock = (
  prisma as unknown as {
    integration: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }
).integration;

function makeRequest(provider: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/integrations/oauth/${provider}/connect`,
    { method: "POST" },
  );
}

function ctx(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

const originalKey = process.env.ASCORA_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u_test" } });
  integrationMock.findFirst.mockResolvedValue(null);
  integrationMock.create.mockResolvedValue({
    id: "integration_1",
    userId: "u_test",
    provider: "ASCORA",
  });
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ASCORA_API_KEY;
  else process.env.ASCORA_API_KEY = originalKey;
});

describe("POST /api/integrations/oauth/ascora/connect", () => {
  it("rejects Ascora and names the canonical static-key route", async () => {
    const res = await POST(makeRequest("ascora"), ctx("ascora"));
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(body.error.message).toMatch(/\/api\/ascora\/connect/);
  });

  it("still rejects when ASCORA_API_KEY is present in the environment", async () => {
    process.env.ASCORA_API_KEY = "env-key-present";

    const res = await POST(makeRequest("ascora"), ctx("ascora"));
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.connected).toBeUndefined();
    expect(body.authUrl).toBeUndefined();
  });

  it("does not create or update an Integration row for the rejected attempt", async () => {
    process.env.ASCORA_API_KEY = "env-key-present";

    await POST(makeRequest("ascora"), ctx("ascora"));

    expect(integrationMock.create).not.toHaveBeenCalled();
    expect(integrationMock.update).not.toHaveBeenCalled();
  });

  it("leaves a genuine OAuth provider working", async () => {
    integrationMock.findFirst.mockResolvedValue({
      id: "integration_2",
      userId: "u_test",
      provider: "SERVICEM8",
    });

    const res = await POST(makeRequest("servicem8"), ctx("servicem8"));

    expect(res.status).toBe(200);
  });
});
