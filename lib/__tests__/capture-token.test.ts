import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { captureToken: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  generateCaptureToken,
  hashCaptureToken,
  verifyCaptureToken,
} from "../capture-token";

const p = prisma as unknown as {
  captureToken: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("capture-token — generate + hash", () => {
  it("generates a 256-bit opaque token with a sha256 hash", () => {
    const a = generateCaptureToken();
    expect(a.token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).toBe(hashCaptureToken(a.token));
  });

  it("produces a unique token each call (no collisions)", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateCaptureToken().token),
    );
    expect(seen.size).toBe(50);
  });

  it("hashes are deterministic and never echo the plaintext", () => {
    expect(hashCaptureToken("abc")).toBe(hashCaptureToken("abc"));
    expect(hashCaptureToken("abc")).not.toContain("abc");
    expect(hashCaptureToken("abc")).not.toBe(hashCaptureToken("abd"));
  });
});

describe("capture-token — verify (hash lookup, never trusts client id)", () => {
  it("resolves a valid token to its bound inspection", async () => {
    p.captureToken.findUnique.mockResolvedValue({
      id: "ct1",
      inspectionId: "i1",
      expiresAt: new Date("2999-01-01"),
      revokedAt: null,
    });
    const res = await verifyCaptureToken("raw", new Date("2026-06-11"));
    expect(p.captureToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashCaptureToken("raw") },
    });
    expect(res).toEqual({ inspectionId: "i1", captureTokenId: "ct1" });
  });

  it("returns null for an unknown token", async () => {
    p.captureToken.findUnique.mockResolvedValue(null);
    expect(await verifyCaptureToken("x")).toBeNull();
  });

  it("returns null for an expired token", async () => {
    p.captureToken.findUnique.mockResolvedValue({
      id: "ct",
      inspectionId: "i1",
      expiresAt: new Date("2000-01-01"),
      revokedAt: null,
    });
    expect(await verifyCaptureToken("x", new Date("2026-06-11"))).toBeNull();
  });

  it("returns null for a revoked token", async () => {
    p.captureToken.findUnique.mockResolvedValue({
      id: "ct",
      inspectionId: "i1",
      expiresAt: new Date("2999-01-01"),
      revokedAt: new Date("2026-01-01"),
    });
    expect(await verifyCaptureToken("x", new Date("2026-06-11"))).toBeNull();
  });

  it("returns null for an empty token without hitting the DB", async () => {
    expect(await verifyCaptureToken("")).toBeNull();
    expect(p.captureToken.findUnique).not.toHaveBeenCalled();
  });
});
