/**
 * RA-7090 slice 2: POST /api/devices/signing-key — device key registration.
 * Only a valid Ed25519 PUBLIC key enters the trust store; re-registration of
 * the same live key is idempotent.
 *
 * Review round 1 (MUST-FIX 3): `publicKeyId` is DERIVED server-side from the
 * SPKI bytes and any client-supplied id is IGNORED. That is what makes
 * revocation permanent — a revoked key re-registering collides with its own
 * revoked row instead of returning under a fresh alias.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deviceSigningKey: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));
// Rate limiting has its own test below; the default is "allowed" so the
// contract tests are not order-dependent.
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mFindUnique = prisma.deviceSigningKey.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mCreate = prisma.deviceSigningKey.create as unknown as ReturnType<
  typeof vi.fn
>;
const mCount = prisma.deviceSigningKey.count as unknown as ReturnType<
  typeof vi.fn
>;
const mRateLimit = applyRateLimit as unknown as ReturnType<typeof vi.fn>;

// Real Ed25519 keypair — the route must accept exactly this shape.
const { publicKey: ED25519_PUBLIC } = crypto.generateKeyPairSync("ed25519");
const ED25519_PEM = ED25519_PUBLIC.export({
  format: "pem",
  type: "spki",
}).toString();
const KEY_ID = crypto
  .createHash("sha256")
  .update(ED25519_PUBLIC.export({ format: "der", type: "spki" }))
  .digest("hex")
  .slice(0, 16);

// A valid public key of the WRONG algorithm.
const { publicKey: EC_PUBLIC } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const EC_PEM = EC_PUBLIC.export({ format: "pem", type: "spki" }).toString();

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/devices/signing-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// No publicKeyId: the server derives it. (A client-supplied one is ignored —
// asserted explicitly below.)
const VALID_BODY = {
  publicKeyPem: ED25519_PEM,
  devicePlatform: "ios",
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech One" } });
  mFindUnique.mockResolvedValue(null);
  mCount.mockResolvedValue(0);
  mRateLimit.mockResolvedValue(null);
  mCreate.mockImplementation(async ({ data }: any) => ({
    id: "dk1",
    createdAt: new Date("2026-07-25T00:00:00.000Z"),
    revokedAt: null,
    lastUsedAt: null,
    deviceUuid: null,
    devicePlatform: null,
    ...data,
  }));
});

describe("POST /api/devices/signing-key", () => {
  it("returns 401 when unauthenticated", async () => {
    mSession.mockResolvedValueOnce(null);
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("registers a valid Ed25519 public key for the authenticated user (201) with a DERIVED id", async () => {
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    // Derived server-side as hex-SHA-256(SPKI DER)[0..16).
    expect(body.deviceSigningKey.publicKeyId).toBe(KEY_ID);

    const created = mCreate.mock.calls[0][0].data;
    expect(created.userId).toBe("u1");
    expect(created.publicKeyId).toBe(KEY_ID);
    expect(created.publicKeyPem).toContain("-----BEGIN PUBLIC KEY-----");
    expect(created.devicePlatform).toBe("ios");
  });

  it("is idempotent: same user re-posting the same live key gets 200, no create", async () => {
    mFindUnique.mockResolvedValueOnce({
      id: "dk1",
      userId: "u1",
      publicKeyId: KEY_ID,
      publicKeyPem: ED25519_PEM,
      revokedAt: null,
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
    });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("rejects the same key material registered to ANOTHER account (409)", async () => {
    mFindUnique.mockResolvedValueOnce({
      id: "dk1",
      userId: "someone-else",
      publicKeyId: KEY_ID,
      publicKeyPem: ED25519_PEM,
      revokedAt: null,
      createdAt: new Date(),
    });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(mCreate).not.toHaveBeenCalled();
  });

  describe("MUST-FIX 3: revocation survives re-registration", () => {
    it("refuses to re-register a REVOKED key (403) so the device rotates instead", async () => {
      mFindUnique.mockResolvedValueOnce({
        id: "dk1",
        userId: "u1",
        publicKeyId: KEY_ID,
        publicKeyPem: ED25519_PEM,
        revokedAt: new Date("2026-07-24T00:00:00.000Z"),
        createdAt: new Date(),
      });
      const res = await POST(postRequest(VALID_BODY));
      expect(res.status).toBe(403);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("a revoked key CANNOT come back under a client-chosen alias — the id is derived from the key", async () => {
      // The attack: re-register the revoked key claiming a brand-new id, so
      // the lookup misses the revoked row and the key signs again.
      const revokedRow = {
        id: "dk1",
        userId: "u1",
        publicKeyId: KEY_ID,
        publicKeyPem: ED25519_PEM,
        revokedAt: new Date("2026-07-24T00:00:00.000Z"),
        createdAt: new Date(),
      };
      // The route must look up by the DERIVED id, so the revoked row is
      // found no matter what alias the client asks for.
      mFindUnique.mockImplementation(async ({ where }: any) =>
        where.publicKeyId === KEY_ID ? revokedRow : null,
      );

      const res = await POST(
        postRequest({
          ...VALID_BODY,
          publicKeyId: "totally-different-alias-99",
        }),
      );
      expect(res.status).toBe(403);
      expect(mCreate).not.toHaveBeenCalled();
      // Proof the lookup ignored the client's alias.
      expect(mFindUnique).toHaveBeenCalledWith({
        where: { publicKeyId: KEY_ID },
      });
    });

    it("IGNORES a client-supplied publicKeyId and persists the derived id", async () => {
      const res = await POST(
        postRequest({ ...VALID_BODY, publicKeyId: "attacker-chosen-alias" }),
      );
      expect(res.status).toBe(201);
      const created = mCreate.mock.calls[0][0].data;
      expect(created.publicKeyId).toBe(KEY_ID);
      expect(created.publicKeyId).not.toBe("attacker-chosen-alias");
    });
  });

  describe("abuse limits (fold-in)", () => {
    it("returns the limiter response when the per-user rate limit trips", async () => {
      mRateLimit.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "rate limited" }), {
          status: 429,
        }),
      );
      const res = await POST(postRequest(VALID_BODY));
      expect(res.status).toBe(429);
      expect(mCreate).not.toHaveBeenCalled();
    });

    it("refuses to register beyond the per-user live-key cap (400)", async () => {
      mCount.mockResolvedValueOnce(20);
      const res = await POST(postRequest(VALID_BODY));
      expect(res.status).toBe(400);
      expect(mCreate).not.toHaveBeenCalled();
    });
  });

  it.each([
    [
      "a non-Ed25519 public key (P-256)",
      { ...VALID_BODY, publicKeyPem: EC_PEM },
    ],
    ["free text as PEM", { ...VALID_BODY, publicKeyPem: "not a pem at all" }],
    ["a missing PEM", { devicePlatform: "ios" }],
    ["an empty PEM", { ...VALID_BODY, publicKeyPem: "" }],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await POST(postRequest(body));
    expect(res.status).toBe(400);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("rejects an Ed25519 PRIVATE key PEM with 400 (never store private material)", async () => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const privatePem = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    const res = await POST(
      postRequest({ ...VALID_BODY, publicKeyPem: privatePem }),
    );
    // createPublicKey() derives the public half from a private PEM, but the
    // route must refuse to persist private key material verbatim.
    expect(res.status).toBe(400);
    expect(mCreate).not.toHaveBeenCalled();
  });
});
