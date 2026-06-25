/**
 * Unit tests for the three live-token-probe checks introduced by
 * `feat(setup-health): live cloud-storage + accounting + BYOK token probes`.
 *
 * Kept in a sibling file so it can fully mock @/lib/prisma without colliding
 * with the integration-style suite in checks.test.ts which uses a real DB.
 * Each describe-block covers the three required outcomes for each check:
 *   - green:  connection exists AND token works
 *   - yellow: no connection exists
 *   - red:    connection exists BUT token rejected
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    organizationPricingConfig: { findUnique: vi.fn() },
    account: { findFirst: vi.fn() },
    integration: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/services/xero/credentials", () => ({
  getValidXeroAccessToken: vi.fn(),
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
  listProviderConnections: vi.fn(),
  validateProviderKey: vi.fn(),
}));

vi.mock("@/lib/ai/model-router", () => ({
  routeBasic: vi.fn(),
}));

import { runAllChecks } from "../checks";
import { prisma } from "@/lib/prisma";
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
import {
  getWorkspaceForUser,
  listProviderConnections,
  validateProviderKey,
} from "@/lib/workspace/provider-connections";

const mocks = {
  orgFindUnique: prisma.organization.findUnique as ReturnType<typeof vi.fn>,
  pricingFindUnique: prisma.organizationPricingConfig.findUnique as ReturnType<
    typeof vi.fn
  >,
  accountFindFirst: prisma.account.findFirst as ReturnType<typeof vi.fn>,
  integrationFindFirst: prisma.integration.findFirst as ReturnType<
    typeof vi.fn
  >,
  getValidXeroAccessToken: getValidXeroAccessToken as ReturnType<typeof vi.fn>,
  getWorkspaceForUser: getWorkspaceForUser as ReturnType<typeof vi.fn>,
  listProviderConnections: listProviderConnections as ReturnType<typeof vi.fn>,
  validateProviderKey: validateProviderKey as ReturnType<typeof vi.fn>,
};

beforeEach(() => {
  // resetAllMocks (not restoreAllMocks): restoreAllMocks only resets spyOn
  // spies, leaving vi.fn() module-mock call history intact across tests — which
  // makes the unconnected-provider `not.toHaveBeenCalled()` assertions see a
  // prior test's call. reset clears history + impl + once-queues; defaults are
  // re-established below.
  vi.resetAllMocks();
  // Default: org exists with owner u1; business profile + branding green
  mocks.orgFindUnique.mockResolvedValue({
    id: "o1",
    ownerId: "u1",
    legalName: "Test Co",
    abn: "53004085616",
    state: "NSW",
    tradingStatus: "TRADING",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#1C2E47",
  });
  mocks.pricingFindUnique.mockResolvedValue({
    masterQualifiedNormalHours: 110,
    administrationFee: 25,
  });
  // Default: no integrations / no BYOK / no Drive
  mocks.accountFindFirst.mockResolvedValue(null);
  mocks.integrationFindFirst.mockResolvedValue(null);
  mocks.getWorkspaceForUser.mockResolvedValue(null);
  mocks.listProviderConnections.mockResolvedValue([]);
  // fetch mock — every test overrides if needed
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  })) as unknown as typeof fetch;
});

// ─── cloud_storage ──────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("cloud_storage check", () => {
  it("green when google account exists and Drive responds 200", async () => {
    mocks.accountFindFirst.mockResolvedValueOnce({
      access_token: "ya29.live-access-token",
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    })) as unknown as typeof fetch;

    const results = await runAllChecks("o1");
    const cs = results.find((r) => r.capability === "cloud_storage");

    expect(cs?.status).toBe("green");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)",
      expect.objectContaining({
        headers: { Authorization: "Bearer ya29.live-access-token" },
      }),
    );
  });

  it("yellow when no google account is connected", async () => {
    mocks.accountFindFirst.mockResolvedValueOnce(null);
    const results = await runAllChecks("o1");
    const cs = results.find((r) => r.capability === "cloud_storage");
    expect(cs?.status).toBe("yellow");
  });

  it("red when google account exists but Drive returns 401", async () => {
    mocks.accountFindFirst.mockResolvedValueOnce({
      access_token: "ya29.dead-token",
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    })) as unknown as typeof fetch;
    const results = await runAllChecks("o1");
    const cs = results.find((r) => r.capability === "cloud_storage");
    expect(cs?.status).toBe("red");
    expect(cs?.note).toMatch(/token rejected/i);
  });

  it("yellow when org does not exist", async () => {
    mocks.orgFindUnique.mockResolvedValueOnce(null);
    const results = await runAllChecks("missing-org");
    const cs = results.find((r) => r.capability === "cloud_storage");
    expect(cs?.status).toBe("yellow");
  });
});

// ─── accounting ─────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("accounting check", () => {
  it("green when Xero integration is CONNECTED and /connections returns 200", async () => {
    mocks.integrationFindFirst.mockResolvedValueOnce({ id: "int1" });
    mocks.getValidXeroAccessToken.mockResolvedValueOnce({
      ok: true,
      data: "xero-token",
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ tenantId: "t1" }],
    })) as unknown as typeof fetch;

    const results = await runAllChecks("o1");
    const acc = results.find((r) => r.capability === "accounting");

    expect(acc?.status).toBe("green");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.xero.com/connections",
      expect.objectContaining({
        headers: { Authorization: "Bearer xero-token" },
      }),
    );
  });

  it("yellow when no Xero integration is connected", async () => {
    mocks.integrationFindFirst.mockResolvedValueOnce(null);
    const results = await runAllChecks("o1");
    const acc = results.find((r) => r.capability === "accounting");
    expect(acc?.status).toBe("yellow");
    expect(mocks.getValidXeroAccessToken).not.toHaveBeenCalled();
  });

  it("red when getValidXeroAccessToken returns REFRESH_FAILED", async () => {
    mocks.integrationFindFirst.mockResolvedValueOnce({ id: "int1" });
    mocks.getValidXeroAccessToken.mockResolvedValueOnce({
      ok: false,
      reason: "REFRESH_FAILED",
      detail: "refresh failed: 401",
    });
    const results = await runAllChecks("o1");
    const acc = results.find((r) => r.capability === "accounting");
    expect(acc?.status).toBe("red");
    expect(acc?.note).toMatch(/refresh failed/i);
  });

  it("red when Xero /connections returns 401", async () => {
    mocks.integrationFindFirst.mockResolvedValueOnce({ id: "int1" });
    mocks.getValidXeroAccessToken.mockResolvedValueOnce({
      ok: true,
      data: "xero-token",
    });
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const results = await runAllChecks("o1");
    const acc = results.find((r) => r.capability === "accounting");
    expect(acc?.status).toBe("red");
    expect(acc?.note).toMatch(/token rejected/i);
  });
});

// ─── byok_keys ──────────────────────────────────────────────────────────────

describe.skipIf(!process.env.DATABASE_URL)("byok_keys check", () => {
  it("green when at least one ACTIVE provider validates successfully", async () => {
    mocks.getWorkspaceForUser.mockResolvedValueOnce({ id: "w1", name: "ws" });
    mocks.listProviderConnections.mockResolvedValueOnce([
      {
        id: "pc1",
        workspaceId: "w1",
        provider: "ANTHROPIC",
        status: "ACTIVE",
        maskedKey: "sk-ant-..1234",
        lastValidatedAt: null,
        lastError: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    mocks.validateProviderKey.mockResolvedValueOnce({
      provider: "ANTHROPIC",
      valid: true,
      latencyMs: 42,
    });

    const results = await runAllChecks("o1");
    const byok = results.find((r) => r.capability === "byok_keys");
    expect(byok?.status).toBe("green");
    expect(mocks.validateProviderKey).toHaveBeenCalledWith("w1", "ANTHROPIC");
  });

  // byok_keys is now a REQUIRED (red-when-unmet) operating-key check: a client
  // must install an Anthropic or OpenAI key before activation. No key ⇒ RED.
  it("red when no provider connections exist", async () => {
    mocks.getWorkspaceForUser.mockResolvedValueOnce({ id: "w1", name: "ws" });
    mocks.listProviderConnections.mockResolvedValueOnce([]);
    const results = await runAllChecks("o1");
    const byok = results.find((r) => r.capability === "byok_keys");
    expect(byok?.status).toBe("red");
    expect(mocks.validateProviderKey).not.toHaveBeenCalled();
  });

  it("red when org has no workspace", async () => {
    mocks.getWorkspaceForUser.mockResolvedValueOnce(null);
    const results = await runAllChecks("o1");
    const byok = results.find((r) => r.capability === "byok_keys");
    expect(byok?.status).toBe("red");
  });

  it("red when an ACTIVE connection exists but validation fails", async () => {
    mocks.getWorkspaceForUser.mockResolvedValueOnce({ id: "w1", name: "ws" });
    mocks.listProviderConnections.mockResolvedValueOnce([
      {
        id: "pc1",
        workspaceId: "w1",
        provider: "ANTHROPIC",
        status: "ACTIVE",
        maskedKey: "sk-ant-..1234",
        lastValidatedAt: null,
        lastError: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    mocks.validateProviderKey.mockResolvedValueOnce({
      provider: "ANTHROPIC",
      valid: false,
      errorMessage: "Invalid Anthropic API key",
      latencyMs: 50,
    });
    const results = await runAllChecks("o1");
    const byok = results.find((r) => r.capability === "byok_keys");
    expect(byok?.status).toBe("red");
    expect(byok?.note).toMatch(/rejected/i);
  });

  it("skips DISABLED connections — treats as no operating key (red)", async () => {
    mocks.getWorkspaceForUser.mockResolvedValueOnce({ id: "w1", name: "ws" });
    mocks.listProviderConnections.mockResolvedValueOnce([
      {
        id: "pc1",
        workspaceId: "w1",
        provider: "OPENAI",
        status: "DISABLED",
        maskedKey: "sk-..1234",
        lastValidatedAt: null,
        lastError: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const results = await runAllChecks("o1");
    const byok = results.find((r) => r.capability === "byok_keys");
    expect(byok?.status).toBe("red");
    expect(mocks.validateProviderKey).not.toHaveBeenCalled();
  });
});
