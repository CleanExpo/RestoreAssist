/**
 * RA-868: Unit tests for Xero token-manager — getValidXeroToken + getXeroTenantId
 *
 * oauth-handler, XeroClient, and Prisma are mocked — no real API calls or DB access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../oauth-handler", () => ({
  getTokens: vi.fn(),
  storeTokens: vi.fn(),
  markIntegrationError: vi.fn(),
}));

const mockRefreshAccessToken = vi.fn();
vi.mock("../client", () => ({
  XeroClient: vi.fn().mockImplementation(() => ({
    refreshAccessToken: mockRefreshAccessToken,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: vi.fn(),
    },
  },
}));

import { getTokens, markIntegrationError } from "../../oauth-handler";
import { prisma } from "@/lib/prisma";
import {
  getValidXeroToken,
  getXeroTenantId,
  XeroTokenError,
} from "../token-manager";

const mockGetTokens = getTokens as ReturnType<typeof vi.fn>;
const mockMarkError = markIntegrationError as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.integration.findUnique as ReturnType<
  typeof vi.fn
>;

const INTEGRATION_ID = "integ_xero_123";
const TENANT_ID = "tenant_abc";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getValidXeroToken ────────────────────────────────────────────────────────

describe("getValidXeroToken", () => {
  it("returns the current token when it's not near expiry", async () => {
    const notExpired = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    mockGetTokens.mockResolvedValue({
      accessToken: "valid_token",
      refreshToken: "refresh_xyz",
      tokenExpiresAt: notExpired,
      isExpired: false,
    });

    const token = await getValidXeroToken(INTEGRATION_ID);

    expect(token).toBe("valid_token");
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    expect(mockMarkError).not.toHaveBeenCalled();
  });

  it("refreshes when token expires within 5 minutes and returns fresh token", async () => {
    const inThreeMinutes = new Date(Date.now() + 3 * 60 * 1000);

    mockGetTokens
      .mockResolvedValueOnce({
        accessToken: "stale_token",
        refreshToken: "refresh_xyz",
        tokenExpiresAt: inThreeMinutes,
        isExpired: false,
      })
      .mockResolvedValueOnce({
        accessToken: "fresh_token",
        refreshToken: "refresh_xyz",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isExpired: false,
      });

    mockFindUnique.mockResolvedValue({ tenantId: TENANT_ID });
    mockRefreshAccessToken.mockResolvedValue(undefined);

    const token = await getValidXeroToken(INTEGRATION_ID);

    expect(token).toBe("fresh_token");
    expect(mockRefreshAccessToken).toHaveBeenCalledOnce();
    expect(mockMarkError).not.toHaveBeenCalled();
  });

  it("refreshes when isExpired flag is true", async () => {
    mockGetTokens
      .mockResolvedValueOnce({
        accessToken: "stale_token",
        refreshToken: "refresh_xyz",
        tokenExpiresAt: new Date(Date.now() - 1000),
        isExpired: true,
      })
      .mockResolvedValueOnce({
        accessToken: "fresh_token",
        refreshToken: "refresh_xyz",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isExpired: false,
      });

    mockFindUnique.mockResolvedValue({ tenantId: TENANT_ID });
    mockRefreshAccessToken.mockResolvedValue(undefined);

    const token = await getValidXeroToken(INTEGRATION_ID);

    expect(token).toBe("fresh_token");
    expect(mockRefreshAccessToken).toHaveBeenCalledOnce();
  });

  it("throws XeroTokenError + stores integration error when refresh fails", async () => {
    mockGetTokens.mockResolvedValue({
      accessToken: "stale_token",
      refreshToken: "refresh_xyz",
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    });
    mockFindUnique.mockResolvedValue({ tenantId: TENANT_ID });
    mockRefreshAccessToken.mockRejectedValue(
      new Error("Xero 401: invalid_grant"),
    );

    await expect(getValidXeroToken(INTEGRATION_ID)).rejects.toThrow(
      XeroTokenError,
    );

    expect(mockMarkError).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.stringContaining("Token refresh failed"),
    );
  });

  it("throws XeroTokenError when no access token exists (disconnected)", async () => {
    mockGetTokens.mockResolvedValue({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isExpired: true,
    });

    await expect(getValidXeroToken(INTEGRATION_ID)).rejects.toThrow(
      XeroTokenError,
    );
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it("throws XeroTokenError when token expired and no refresh token available", async () => {
    mockGetTokens.mockResolvedValue({
      accessToken: "stale_token",
      refreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    });

    await expect(getValidXeroToken(INTEGRATION_ID)).rejects.toThrow(
      XeroTokenError,
    );
    expect(mockMarkError).toHaveBeenCalledWith(
      INTEGRATION_ID,
      expect.stringContaining("no refresh token"),
    );
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });
});

// ─── getXeroTenantId ──────────────────────────────────────────────────────────

describe("getXeroTenantId", () => {
  it("returns the tenant ID when present", async () => {
    mockFindUnique.mockResolvedValue({ tenantId: TENANT_ID });

    const tenantId = await getXeroTenantId(INTEGRATION_ID);

    expect(tenantId).toBe(TENANT_ID);
  });

  it("throws XeroTokenError when integration is missing", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(getXeroTenantId(INTEGRATION_ID)).rejects.toThrow(
      XeroTokenError,
    );
  });

  it("throws XeroTokenError when tenant ID is null", async () => {
    mockFindUnique.mockResolvedValue({ tenantId: null });

    await expect(getXeroTenantId(INTEGRATION_ID)).rejects.toThrow(
      XeroTokenError,
    );
  });
});
