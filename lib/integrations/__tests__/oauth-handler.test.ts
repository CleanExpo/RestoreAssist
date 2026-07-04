import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const integrationFindUnique = vi.fn();
const integrationUpdate = vi.fn();
const decryptMock = vi.fn((v: string) => v.replace(/^encrypted:/, ""));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findUnique: (...args: unknown[]) => integrationFindUnique(...args),
      update: (...args: unknown[]) => integrationUpdate(...args),
    },
  },
}));
vi.mock("@/lib/credential-vault", () => ({
  encrypt: (v: string) => `encrypted:${v}`,
  decrypt: (...args: [string]) => decryptMock(...args),
}));

import { disconnectIntegration } from "../oauth-handler";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  integrationFindUnique.mockReset();
  integrationUpdate.mockReset();
  integrationUpdate.mockResolvedValue({});
  decryptMock.mockReset();
  decryptMock.mockImplementation((v: string) => v.replace(/^encrypted:/, ""));
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("disconnectIntegration", () => {
  it("nulls all token fields locally (works even for a CANCELED/lapsed user)", async () => {
    integrationFindUnique.mockResolvedValue({
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
      provider: "XERO",
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
    expect(integrationUpdate).toHaveBeenCalled();
  });

  it("still clears local tokens even if the provider revoke call throws", async () => {
    process.env.XERO_CLIENT_ID = "client-id";
    process.env.XERO_CLIENT_SECRET = "client-secret";
    integrationFindUnique.mockResolvedValue({
      provider: "XERO",
      accessToken: "encrypted:access-1",
      refreshToken: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(disconnectIntegration("integration_1")).resolves.not.toThrow();
    expect(integrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accessToken: null }),
      }),
    );
  });

  it("still clears local tokens even if the stored token can't be decrypted (post key-rotation / corrupt token)", async () => {
    integrationFindUnique.mockResolvedValue({
      provider: "XERO",
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
});
