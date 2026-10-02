import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const integrationFindUnique = vi.fn();
const integrationUpdate = vi.fn();
const integrationUpdateMany = vi.fn();
const oauthStateCreate = vi.fn();
const oauthStateFindUnique = vi.fn();
const oauthStateUpdateMany = vi.fn();
const decryptMock = vi.fn((v: string) => v.replace(/^encrypted:/, ""));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: (...args: unknown[]) => integrationFindUnique(...args),
      update: (...args: unknown[]) => integrationUpdate(...args),
      updateMany: (...args: unknown[]) => integrationUpdateMany(...args),
    },
    oAuthStateNonce: {
      create: (...args: unknown[]) => oauthStateCreate(...args),
      findUnique: (...args: unknown[]) => oauthStateFindUnique(...args),
      updateMany: (...args: unknown[]) => oauthStateUpdateMany(...args),
    },
  },
}));
vi.mock("@/lib/credential-vault", () => ({
  encrypt: (v: string) => `encrypted:${v}`,
  decrypt: (...args: [string]) => decryptMock(...args),
}));

import {
  disconnectIntegration,
  generateOAuthState,
  validateOAuthState,
} from "../oauth-handler";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  integrationFindUnique.mockReset();
  integrationUpdate.mockReset();
  integrationUpdate.mockResolvedValue({});
  integrationUpdateMany.mockReset();
  integrationUpdateMany.mockResolvedValue({ count: 1 });
  oauthStateCreate.mockReset();
  oauthStateCreate.mockResolvedValue({});
  oauthStateFindUnique.mockReset();
  oauthStateUpdateMany.mockReset();
  decryptMock.mockReset();
  decryptMock.mockImplementation((v: string) => v.replace(/^encrypted:/, ""));
  vi.unstubAllGlobals();
});

describe("OAuth state callback context", () => {
  it("persists PKCE context on the one-time state instead of shared integration config", async () => {
    const state = await generateOAuthState("u1", "XERO", {
      integrationId: "integration_1",
      redirectUri: "https://app.example/api/integrations/oauth/xero/callback",
      codeVerifier: "verifier-1",
    });

    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(oauthStateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nonce: state,
        userId: "u1",
        provider: "XERO",
        integrationId: "integration_1",
        redirectUri: "https://app.example/api/integrations/oauth/xero/callback",
        codeVerifier: "verifier-1",
      }),
    });
  });

  it("returns the context belonging to the consumed state", async () => {
    oauthStateFindUnique.mockResolvedValue({
      userId: "u1",
      provider: "XERO",
      integrationId: "integration_1",
      redirectUri: "https://app.example/callback",
      codeVerifier: "verifier-1",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    oauthStateUpdateMany.mockResolvedValue({ count: 1 });

    await expect(validateOAuthState("state-1")).resolves.toEqual({
      userId: "u1",
      provider: "XERO",
      integrationId: "integration_1",
      redirectUri: "https://app.example/callback",
      codeVerifier: "verifier-1",
    });
  });

  const storedState = (overrides: Record<string, unknown> = {}) => ({
    userId: "u1", provider: "XERO", integrationId: "integration_1", redirectUri: null,
    codeVerifier: "verifier-1", expiresAt: new Date(Date.now() + 60_000), usedAt: null, ...overrides,
  });

  it("refuses a state that was already used", async () => {
    oauthStateFindUnique.mockResolvedValue(storedState({ usedAt: new Date() }));
    oauthStateUpdateMany.mockResolvedValue({ count: 1 });

    await expect(validateOAuthState("state-1")).resolves.toBeNull();
    expect(oauthStateUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a state another callback consumed first", async () => {
    oauthStateFindUnique.mockResolvedValue(storedState());
    oauthStateUpdateMany.mockResolvedValue({ count: 0 });

    await expect(validateOAuthState("state-1")).resolves.toBeNull();
    expect(oauthStateUpdateMany).toHaveBeenCalledWith({
      where: { nonce: "state-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("refuses an expired state", async () => {
    oauthStateFindUnique.mockResolvedValue(storedState({ expiresAt: new Date(Date.now() - 1) }));
    oauthStateUpdateMany.mockResolvedValue({ count: 1 });

    await expect(validateOAuthState("state-1")).resolves.toBeNull();
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("disconnectIntegration", () => {
  it("nulls all token fields locally (works even for a CANCELED/lapsed user)", async () => {
    integrationFindUnique.mockResolvedValue({
      name: "MYOB",
      provider: "MYOB", // no revoke endpoint — exercises the "skip revoke" path
      accessToken: "encrypted:access-1",
      refreshToken: "encrypted:refresh-1",
    });

    await disconnectIntegration("integration_1");

    expect(integrationUpdate).toHaveBeenCalledWith({
      where: { id: "integration_1" },
      data: expect.objectContaining({
        status: "DISCONNECTED",
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        tenantId: null,
        realmId: null,
        companyId: null,
        syncError: null,
      }),
    });
  });

  it("calls Xero's revocation endpoint with the decrypted tokens before clearing them locally", async () => {
    process.env.XERO_CLIENT_ID = "client-id";
    process.env.XERO_CLIENT_SECRET = "client-secret";
    integrationFindUnique.mockResolvedValue({
      id: "integration_1", userId: "synthetic-owner", workspaceId: null, updatedAt: new Date("2026-10-01"),
      provider: "XERO",
      name: "Xero",
      accessToken: "encrypted:access-1",
      refreshToken: "encrypted:refresh-1",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await disconnectIntegration("integration_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://identity.xero.com/connect/revocation",
      expect.objectContaining({ method: "POST" }),
    );
    // Called once per token (refresh + access).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(integrationUpdateMany).toHaveBeenCalled();
  });

  it("still clears local tokens even if the provider revoke call throws", async () => {
    process.env.XERO_CLIENT_ID = "client-id";
    process.env.XERO_CLIENT_SECRET = "client-secret";
    integrationFindUnique.mockResolvedValue({
      id: "integration_1", userId: "synthetic-owner", workspaceId: null, updatedAt: new Date("2026-10-01"),
      provider: "XERO",
      name: "Xero",
      accessToken: "encrypted:access-1",
      refreshToken: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(disconnectIntegration("integration_1")).resolves.not.toThrow();
    expect(integrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accessToken: null }),
      }),
    );
  });

  it("still clears local tokens even if the stored token can't be decrypted (post key-rotation / corrupt token)", async () => {
    integrationFindUnique.mockResolvedValue({
      id: "integration_1", userId: "synthetic-owner", workspaceId: null, updatedAt: new Date("2026-10-01"),
      provider: "XERO",
      name: "Xero",
      accessToken: "encrypted:access-1",
      refreshToken: "encrypted:refresh-1",
    });
    decryptMock.mockImplementation(() => {
      throw new Error("Invalid encrypted value format");
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(disconnectIntegration("integration_1")).resolves.not.toThrow();

    // Undecryptable token means we can't revoke it at the provider — must
    // skip the revoke call rather than throw.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(integrationUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "integration_1", provider: "XERO", userId: "synthetic-owner", workspaceId: null }),
      data: expect.objectContaining({
        status: "DISCONNECTED",
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        tenantId: null,
        realmId: null,
        companyId: null,
        syncError: null,
      }),
    });
  });
});
