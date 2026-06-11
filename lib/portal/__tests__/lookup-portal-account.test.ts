import { describe, expect, it, beforeEach, vi } from "vitest";

const findFirst = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientPortalAccount: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

import { lookupPortalAccount } from "../lookup-portal-account";

beforeEach(() => {
  findFirst.mockReset();
  update.mockReset();
  update.mockResolvedValue({});
});

describe("lookupPortalAccount", () => {
  it("returns null on empty / missing / non-string token", async () => {
    expect(await lookupPortalAccount("")).toBeNull();
    expect(await lookupPortalAccount(null)).toBeNull();
    expect(await lookupPortalAccount(undefined)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns null when no row matches", async () => {
    findFirst.mockResolvedValueOnce(null);
    const r = await lookupPortalAccount("nope");
    expect(r).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("filters revoked rows via { revokedAt: null }", async () => {
    findFirst.mockResolvedValueOnce(null);
    await lookupPortalAccount("revoked-tok");
    expect(findFirst).toHaveBeenCalledWith({
      where: { token: "revoked-tok", revokedAt: null },
      select: {
        id: true,
        clientId: true,
        createdAt: true,
        tokenRotatedAt: true,
        expiresAt: true,
      },
    });
  });

  it("returns null for an expired link (expiresAt in the past)", async () => {
    findFirst.mockResolvedValueOnce({
      id: "cpa_x",
      clientId: "c_x",
      createdAt: new Date(),
      tokenRotatedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await lookupPortalAccount("expired")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a link whose expiresAt is in the future", async () => {
    findFirst.mockResolvedValueOnce({
      id: "cpa_y",
      clientId: "c_y",
      createdAt: new Date(),
      tokenRotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await lookupPortalAccount("fresh");
    expect(r?.clientId).toBe("c_y");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("returns the row and stamps lastAccessedAt on hit", async () => {
    const row = {
      id: "cpa_1",
      clientId: "c_1",
      createdAt: new Date("2026-05-15T00:00:00Z"),
      tokenRotatedAt: null,
    };
    findFirst.mockResolvedValueOnce(row);
    const r = await lookupPortalAccount("good-tok");
    expect(r).toEqual(row);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].where).toEqual({ id: "cpa_1" });
    expect(update.mock.calls[0][0].data.lastAccessedAt).toBeInstanceOf(Date);
  });

  it("does not throw if the lastAccessedAt update fails", async () => {
    findFirst.mockResolvedValueOnce({
      id: "cpa_2",
      clientId: "c_2",
      createdAt: new Date(),
      tokenRotatedAt: null,
    });
    update.mockRejectedValueOnce(new Error("db hiccup"));
    await expect(lookupPortalAccount("good")).resolves.toMatchObject({
      id: "cpa_2",
    });
  });
});
