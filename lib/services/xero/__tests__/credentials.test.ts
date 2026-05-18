import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/oauth-handler", () => ({
  getTokens: vi.fn(),
  storeTokens: vi.fn(),
  markIntegrationError: vi.fn(),
  disconnectIntegration: vi.fn(),
}));
vi.mock("@/lib/integrations/xero/client", () => ({
  XeroClient: vi.fn().mockImplementation(() => ({
    refreshAccessToken: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findUnique: vi.fn().mockResolvedValue({ tenantId: "T1" }) },
  },
}));

import { getValidXeroAccessToken } from "../credentials";
import { getTokens } from "@/lib/integrations/oauth-handler";

const FIVE_MIN = 5 * 60 * 1000;

describe("getValidXeroAccessToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok when token is fresh", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "fresh",
      refreshToken: "r",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      isExpired: false,
    } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe("fresh");
  });

  it("returns DISCONNECTED when no access token", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isExpired: true,
    } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("DISCONNECTED");
  });

  it("returns RECONNECT_REQUIRED when expired without refresh token", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "old",
      refreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("RECONNECT_REQUIRED");
  });

  it("refreshes when within 5-minute window and returns new token", async () => {
    vi.mocked(getTokens)
      .mockResolvedValueOnce({
        accessToken: "stale",
        refreshToken: "r",
        tokenExpiresAt: new Date(Date.now() + FIVE_MIN - 1000),
        isExpired: false,
      } as never)
      .mockResolvedValueOnce({
        accessToken: "refreshed",
        refreshToken: "r2",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isExpired: false,
      } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe("refreshed");
  });

  it("returns REFRESH_FAILED when XeroClient.refreshAccessToken throws", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "stale",
      refreshToken: "r",
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    } as never);

    const { XeroClient } = await import("@/lib/integrations/xero/client");
    vi.mocked(XeroClient).mockImplementationOnce(
      () =>
        ({
          refreshAccessToken: vi
            .fn()
            .mockRejectedValueOnce(new Error("invalid_grant")),
        }) as never,
    );

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("REFRESH_FAILED");
      expect(r.detail).toContain("invalid_grant");
    }
  });

  it("returns REFRESH_FAILED when refresh resolves but getTokens still returns no accessToken", async () => {
    vi.mocked(getTokens)
      .mockResolvedValueOnce({
        accessToken: "stale",
        refreshToken: "r",
        tokenExpiresAt: new Date(Date.now() - 1000),
        isExpired: true,
      } as never)
      .mockResolvedValueOnce({
        accessToken: null,
        refreshToken: "r",
        tokenExpiresAt: null,
        isExpired: true,
      } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("REFRESH_FAILED");
      expect(r.detail).toContain("token still missing");
    }
  });

  it("propagates the original Error via cause on REFRESH_FAILED", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "stale",
      refreshToken: "r",
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    } as never);

    const original = new Error("network down");
    const { XeroClient } = await import("@/lib/integrations/xero/client");
    vi.mocked(XeroClient).mockImplementationOnce(
      () =>
        ({
          refreshAccessToken: vi.fn().mockRejectedValueOnce(original),
        }) as never,
    );

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cause).toBe(original);
    }
  });
});
