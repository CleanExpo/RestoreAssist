/**
 * RA-7090 slice 2: POST /api/devices/signing-key — device key registration.
 * Only a valid Ed25519 PUBLIC key enters the trust store; re-registration of
 * the same live key is idempotent; id collisions with a different key or
 * another user's key are 409.
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
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mFindUnique = prisma.deviceSigningKey.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mCreate = prisma.deviceSigningKey.create as unknown as ReturnType<
  typeof vi.fn
>;

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

const VALID_BODY = {
  publicKeyId: KEY_ID,
  publicKeyPem: ED25519_PEM,
  devicePlatform: "ios",
};

beforeEach(() => {
  vi.clearAllMocks();
  mSession.mockResolvedValue({ user: { id: "u1", name: "Tech One" } });
  mFindUnique.mockResolvedValue(null);
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

  it("registers a valid Ed25519 public key for the authenticated user (201)", async () => {
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
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

  it("rejects an id collision with ANOTHER USER'S key (409)", async () => {
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

  it("rejects re-registration of a REVOKED key (409) — revocation is final", async () => {
    mFindUnique.mockResolvedValueOnce({
      id: "dk1",
      userId: "u1",
      publicKeyId: KEY_ID,
      publicKeyPem: ED25519_PEM,
      revokedAt: new Date("2026-07-24T00:00:00.000Z"),
      createdAt: new Date(),
    });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("rejects the same id with a DIFFERENT public key (409)", async () => {
    const { publicKey: other } = crypto.generateKeyPairSync("ed25519");
    mFindUnique.mockResolvedValueOnce({
      id: "dk1",
      userId: "u1",
      publicKeyId: KEY_ID,
      publicKeyPem: other.export({ format: "pem", type: "spki" }).toString(),
      revokedAt: null,
      createdAt: new Date(),
    });
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-Ed25519 public key (P-256)", { ...VALID_BODY, publicKeyPem: EC_PEM }],
    ["free text as PEM", { ...VALID_BODY, publicKeyPem: "not a pem at all" }],
    ["a missing PEM", { publicKeyId: KEY_ID }],
    ["a malformed publicKeyId", { ...VALID_BODY, publicKeyId: "nope!" }],
    ["a too-short publicKeyId", { ...VALID_BODY, publicKeyId: "abc" }],
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
