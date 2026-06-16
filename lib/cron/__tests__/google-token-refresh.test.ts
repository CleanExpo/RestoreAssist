import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const tx = {
    account: { findMany: vi.fn(), update: vi.fn() },
  };
  return { prisma: tx };
});

import { prisma } from "@/lib/prisma";
import { refreshGoogleTokens } from "../google-token-refresh";
import {
  isEncryptedToken,
  decryptAccountTokens,
} from "@/lib/auth/account-tokens";

const account = (
  prisma as unknown as {
    account: {
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }
).account;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  // B3: the refresh path encrypts the rewritten access_token at rest.
  process.env.INTEGRATION_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  account.update.mockResolvedValue({});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("refreshGoogleTokens — bounded ordered batch", () => {
  it("queries with a bounded take and most-urgent-first ordering", async () => {
    account.findMany.mockResolvedValueOnce([]);

    await refreshGoogleTokens();

    expect(account.findMany).toHaveBeenCalledTimes(1);
    const arg = account.findMany.mock.calls[0][0];

    // Bounded: a numeric take must be present so the run can't be killed
    // mid-loop and starve the tail.
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);

    // Ordered: most-urgent first — never-refreshed (expires_at NULL) then
    // longest-since-refreshed.
    expect(arg.orderBy).toEqual({
      expires_at: { sort: "asc", nulls: "first" },
    });

    // Scope unchanged.
    expect(arg.where).toEqual({
      provider: "google",
      refresh_token: { not: null },
    });
  });

  it("processes every row in the returned batch", async () => {
    account.findMany.mockResolvedValueOnce([
      {
        id: "a1",
        userId: "u1",
        refresh_token: "r1",
        expires_at: null,
        scope: "s",
      },
      {
        id: "a2",
        userId: "u2",
        refresh_token: "r2",
        expires_at: 1,
        scope: "s",
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "new", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshGoogleTokens();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(account.update).toHaveBeenCalledTimes(2);
    expect(result.itemsProcessed).toBe(2);
    expect(result.metadata?.refreshed).toBe(2);

    // B3: the rewritten access_token is encrypted at rest, not stored plaintext.
    const writeData = account.update.mock.calls[0][0].data;
    expect(writeData.access_token).not.toBe("new");
    expect(isEncryptedToken(writeData.access_token)).toBe(true);
    expect(decryptAccountTokens(writeData).access_token).toBe("new");
  });

  it("isolates per-row failures and clears dead refresh tokens", async () => {
    account.findMany.mockResolvedValueOnce([
      {
        id: "a1",
        userId: "u1",
        refresh_token: "good",
        expires_at: 1,
        scope: "s",
      },
      {
        id: "a2",
        userId: "u2",
        refresh_token: "dead",
        expires_at: 2,
        scope: "s",
      },
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "new", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":"invalid_grant"}',
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshGoogleTokens();

    expect(result.metadata?.refreshed).toBe(1);
    expect(result.metadata?.failed).toBe(1);
    expect(result.metadata?.invalidated).toBe(1);
    // One success update + one invalidation update.
    expect(account.update).toHaveBeenCalledTimes(2);
  });

  it("short-circuits when Google client env is missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    const result = await refreshGoogleTokens();

    expect(account.findMany).not.toHaveBeenCalled();
    expect(result.metadata?.reason).toBe("missing-google-client-env");
  });
});
