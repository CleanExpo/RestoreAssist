import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { POST } from "../route";

const validateCsrf = vi.fn();
const getServerSession = vi.fn();
const inviteFindUnique = vi.fn();
const accountFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userCreate = vi.fn();
const userUpdateMany = vi.fn();
const userUpdate = vi.fn();
const inviteUpdateMany = vi.fn();
const inviteUpdate = vi.fn();
const rejectIfBreached = vi.fn();
const sendInviteEmail = vi.fn();
const cloudinaryUploadDataUrl = vi.fn();
const cloudinaryDeleteImage = vi.fn();
const mediaCleanupUpsert = vi.fn();
const rateLimitHitDeleteMany = vi.fn();
const rateLimitHitCreate = vi.fn();
const rateLimitHitCount = vi.fn();
const rateLimitHitDelete = vi.fn();
const rateLimitHitFindFirst = vi.fn();

const INVITE_TOKEN = "a".repeat(48);

vi.mock("@/lib/csrf", () => ({
  validateCsrf: (...a: unknown[]) => validateCsrf(...a),
}));
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/password-breach", () => ({
  rejectIfBreached: (...a: unknown[]) => rejectIfBreached(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findFirst: (...a: unknown[]) => accountFindFirst(...a),
    },
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      updateMany: (...a: unknown[]) => inviteUpdateMany(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      create: (...a: unknown[]) => userCreate(...a),
      updateMany: (...a: unknown[]) => userUpdateMany(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    rateLimitHit: {
      deleteMany: (...a: unknown[]) => rateLimitHitDeleteMany(...a),
      create: (...a: unknown[]) => rateLimitHitCreate(...a),
      count: (...a: unknown[]) => rateLimitHitCount(...a),
      delete: (...a: unknown[]) => rateLimitHitDelete(...a),
      findFirst: (...a: unknown[]) => rateLimitHitFindFirst(...a),
    },
    mediaCleanupTask: { upsert: (...a: unknown[]) => mediaCleanupUpsert(...a) },
    // Existing route wraps user.create + invite.update in $transaction.
    // Pass-through so the unit mocks above still capture the calls.
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        rateLimitHit: {
          create: (...a: unknown[]) => rateLimitHitCreate(...a),
          count: (...a: unknown[]) => rateLimitHitCount(...a),
          delete: (...a: unknown[]) => rateLimitHitDelete(...a),
          findFirst: (...a: unknown[]) => rateLimitHitFindFirst(...a),
        },
        userInvite: {
          findUnique: (...a: unknown[]) => inviteFindUnique(...a),
          updateMany: (...a: unknown[]) => inviteUpdateMany(...a),
          update: (...a: unknown[]) => inviteUpdate(...a),
        },
        user: {
          findUnique: (...a: unknown[]) => userFindUnique(...a),
          findFirst: (...a: unknown[]) => userFindFirst(...a),
          create: (...a: unknown[]) => userCreate(...a),
          updateMany: (...a: unknown[]) => userUpdateMany(...a),
          update: (...a: unknown[]) => userUpdate(...a),
        },
      }),
  },
}));
vi.mock("@/lib/email", () => ({
  sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a),
}));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: async (fn: () => unknown) => fn(),
}));
vi.mock("@/lib/notifications", () => ({ notifyTeamMemberJoined: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  uploadDataUrlWithReceipt: (...a: unknown[]) => cloudinaryUploadDataUrl(...a),
  deleteImage: (...a: unknown[]) => cloudinaryDeleteImage(...a),
}));

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "invite-test-secret";
  validateCsrf.mockReset().mockReturnValue(null);
  getServerSession.mockReset().mockResolvedValue({
    user: { id: "u_existing_google", email: "jamie@example.com" },
  });
  accountFindFirst.mockReset().mockResolvedValue({ id: "google_account_1" });
  inviteFindUnique.mockReset();
  userFindUnique.mockReset();
  userFindFirst.mockReset().mockImplementation(({ where }) =>
    where.email ? null : { id: "manager_1" },
  );
  userCreate.mockReset();
  userCreate.mockResolvedValue({ id: "u_new" });
  userUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  userUpdate.mockReset().mockResolvedValue({ id: "u_pending" });
  inviteUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  inviteUpdate.mockReset().mockResolvedValue({});
  rejectIfBreached.mockReset().mockResolvedValue(null);
  sendInviteEmail.mockReset();
  cloudinaryUploadDataUrl.mockReset();
  cloudinaryDeleteImage.mockReset().mockResolvedValue(undefined);
  mediaCleanupUpsert.mockReset().mockResolvedValue({ id: "cleanup_1" });
  rateLimitHitDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  rateLimitHitCreate.mockReset().mockResolvedValue({ id: "rate_hit_1" });
  rateLimitHitCount.mockReset().mockResolvedValue(1);
  rateLimitHitDelete.mockReset().mockResolvedValue({});
  rateLimitHitFindFirst.mockReset().mockResolvedValue(null);
});

// Tiny but real-magic JPEG (FF D8 FF E0 … FF D9) — passes the SP-7 Seam F
// server-side magic-byte gate (lib/headshot/validate-data-url.ts).
const VALID_JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
]).toString("base64")}`;

const baseBody = {
  name: "Jamie Tradie",
  password: "verysecurepassword12",
  phone: "0412 345 678",
  headshotDataUrl: VALID_JPEG_DATA_URL,
  acceptedTerms: true,
  acceptedChainOfCustody: true,
};

function payloadHash(body: typeof baseBody & { provider?: "google" }) {
  const headshotHash = crypto.createHash("sha256").update(body.headshotDataUrl).digest("hex");
  return crypto
    .createHmac("sha256", process.env.NEXTAUTH_SECRET!)
    .update(JSON.stringify([
      body.provider === "google" ? "google" : "credentials",
      body.name,
      "0412345678",
      headshotHash,
      body.provider === "google" ? "" : body.password,
      true,
      true,
    ]))
    .digest("hex");
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/invites/${INVITE_TOKEN}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function ctx() {
  return { params: Promise.resolve({ token: INVITE_TOKEN }) };
}

describe("POST /api/invites/[token] (extended)", () => {
  it("requires an Origin for the state-changing acceptance request", async () => {
    validateCsrf.mockReturnValueOnce(
      Response.json({ error: "CSRF validation failed" }, { status: 403 }),
    );
    const res = await POST(makeReq(baseBody), await ctx());
    expect(res.status).toBe(403);
    expect(validateCsrf).toHaveBeenCalledWith(
      expect.anything(),
      { requireOrigin: true },
    );
    expect(inviteFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when phone is missing", async () => {
    const res = await POST(
      makeReq({ ...baseBody, phone: undefined }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when phone is not a valid AU mobile", async () => {
    const res = await POST(
      makeReq({ ...baseBody, phone: "+1 415 555 1234" }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when headshotDataUrl is missing on email-password path", async () => {
    const res = await POST(
      makeReq({ ...baseBody, headshotDataUrl: undefined }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when acceptedChainOfCustody is not true", async () => {
    const res = await POST(
      makeReq({ ...baseBody, acceptedChainOfCustody: false }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("refuses a legacy invite carrying the ADMIN role", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "ADMIN",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(409);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("refuses a manager assignment that is not valid inside the invite tenant", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      managedById: "manager_from_other_org",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindFirst.mockResolvedValueOnce(null);

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(409);
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "manager_from_other_org",
          organizationId: "org_1",
        }),
      }),
    );
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates User with phone + image when email-password happy path", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce(null); // email not yet exists
    cloudinaryUploadDataUrl.mockResolvedValueOnce(
      { url: "https://res.cloudinary.com/.../jamie.jpg", publicId: "headshots/jamie-1" },
    );
    userCreate.mockResolvedValueOnce({
      id: "u_new",
      email: "jamie@example.com",
      name: "Jamie Tradie",
      role: "USER",
    });

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(200);
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "jamie@example.com",
          name: "Jamie Tradie",
          role: "USER",
          organizationId: "org_1",
          phone: "0412345678",
          image: "https://res.cloudinary.com/.../jamie.jpg",
        }),
      }),
    );
    expect(inviteUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({
        acceptedUserId: "u_new",
        acceptanceProvider: "credentials",
        acceptancePayloadHash: expect.any(String),
      }),
    });
  });

  it("rejects a password confirmed by the breach check", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    rejectIfBreached.mockResolvedValueOnce("This password is known to be breached");

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(400);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("detects an existing account case-insensitively before password acceptance", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindFirst.mockResolvedValueOnce({
      id: "existing_uppercase",
      email: "Jamie@Example.com",
    });

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(409);
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: "jamie@example.com", mode: "insensitive" },
        },
      }),
    );
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
  });

  it("atomically adopts only an abandoned no-entitlement OAuth identity", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1", token: INVITE_TOKEN, email: "jamie@example.com", role: "USER",
      organizationId: "org_1", managedById: null,
      expiresAt: new Date(Date.now() + 86400000), usedAt: null,
    });
    userFindFirst.mockResolvedValueOnce({
      id: "u_pending", role: "USER", organizationId: null,
      subscriptionStatus: null, subscriptionPlan: null, subscriptionId: null,
      stripeCustomerId: null, trialEndsAt: null, subscriptionEndsAt: null,
      creditsRemaining: null, quickFillCreditsRemaining: null,
      signupBonusApplied: false, pendingInviteIdentity: true, ownedOrganizations: [],
    });
    userUpdate.mockResolvedValueOnce({ id: "u_pending" });
    cloudinaryUploadDataUrl.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/.../pending.jpg",
      publicId: "headshots/pending",
    });

    const res = await POST(makeReq(baseBody), await ctx());
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "u_pending", organizationId: null },
      data: expect.objectContaining({
        organizationId: "org_1", role: "USER", pendingInviteIdentity: false,
      }),
    }));
    expect(userCreate).not.toHaveBeenCalled();
    expect(inviteUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ acceptedUserId: "u_pending" }),
    }));
  });

  it("on provider:'google' path, skips password validation", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce(
      { url: "https://res.cloudinary.com/.../jamie.jpg", publicId: "headshots/jamie-2" },
    );
    userFindUnique.mockResolvedValueOnce({
      email: "jamie@example.com",
      organizationId: null,
      ownedOrganizations: [],
    });

    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: VALID_JPEG_DATA_URL,
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );

    expect(res.status).toBe(200);
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "u_existing_google",
          organizationId: null,
          pendingInviteIdentity: true,
        },
        data: expect.objectContaining({ pendingInviteIdentity: false }),
      }),
    );
    expect(inviteUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: expect.objectContaining({
        acceptedUserId: "u_existing_google",
        acceptanceProvider: "google",
        acceptancePayloadHash: expect.any(String),
      }),
    });
  });

  it("on provider:'google' path, rejects an anonymous caller", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: VALID_JPEG_DATA_URL,
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );
    expect(res.status).toBe(401);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
  });

  it("on provider:'google' path, rejects a session without a linked Google account", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    accountFindFirst.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: VALID_JPEG_DATA_URL,
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );
    expect(res.status).toBe(403);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
  });

  it("on provider:'google' path, refuses to move an existing tenant member", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce({
      email: "jamie@example.com",
      organizationId: "attacker_target_org",
      ownedOrganizations: [],
    });

    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: VALID_JPEG_DATA_URL,
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );

    expect(res.status).toBe(409);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
    expect(inviteUpdateMany).not.toHaveBeenCalled();
  });

  it("rolls back account attachment when the invite cannot be atomically claimed", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce({
      email: "jamie@example.com",
      organizationId: null,
      ownedOrganizations: [],
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce(
      { url: "https://res.cloudinary.com/.../jamie.jpg", publicId: "headshots/jamie-3" },
    );
    inviteUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: VALID_JPEG_DATA_URL,
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );

    expect(res.status).toBe(409);
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(cloudinaryDeleteImage).toHaveBeenCalledWith("headshots/jamie-3");
  });

  it("refuses attachment when the Google user gains a tenant during acceptance", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce({
      email: "jamie@example.com",
      organizationId: null,
      ownedOrganizations: [],
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce(
      { url: "https://res.cloudinary.com/.../jamie.jpg", publicId: "headshots/jamie-4" },
    );
    userUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: VALID_JPEG_DATA_URL,
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );

    expect(res.status).toBe(409);
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "u_existing_google",
          organizationId: null,
          pendingInviteIdentity: true,
        },
      }),
    );
    expect(cloudinaryDeleteImage).toHaveBeenCalledWith("headshots/jamie-4");
  });

  it("replays a durable credentials success receipt after the response was lost", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: new Date(),
      acceptedUserId: "u_accepted",
      acceptanceProvider: "credentials",
      acceptancePayloadHash: payloadHash(baseBody),
    });
    userFindFirst.mockResolvedValueOnce({ id: "u_accepted" });

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      replayed: true,
      email: "jamie@example.com",
    });
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("refuses a credentials replay whose accepted payload changed", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1", token: INVITE_TOKEN, email: "jamie@example.com", role: "USER",
      organizationId: "org_1", expiresAt: new Date(Date.now() + 86400000),
      usedAt: new Date(), acceptedUserId: "u_accepted",
      acceptanceProvider: "credentials", acceptancePayloadHash: payloadHash(baseBody),
    });
    const res = await POST(
      makeReq({ ...baseBody, password: "different-secure-password-99" }),
      await ctx(),
    );
    expect(res.status).toBe(410);
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("replays Google success only to the accepted Google account", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: new Date(),
      acceptedUserId: "u_existing_google",
      acceptanceProvider: "google",
      acceptancePayloadHash: payloadHash({ ...baseBody, provider: "google" }),
    });
    userFindFirst.mockResolvedValueOnce({ id: "u_existing_google" });

    const res = await POST(
      makeReq({ ...baseBody, provider: "google", password: undefined }),
      await ctx(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, replayed: true });
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
  });

  it("compensating-deletes the uploaded headshot on an unexpected transaction failure", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/.../jamie.jpg",
      publicId: "headshots/unexpected-failure",
    });
    inviteUpdateMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(POST(makeReq(baseBody), await ctx())).rejects.toThrow(
      "database unavailable",
    );
    expect(cloudinaryDeleteImage).toHaveBeenCalledWith(
      "headshots/unexpected-failure",
    );
  });

  it("durably queues cleanup and refuses a completed result when deletion fails", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1", token: INVITE_TOKEN, email: "jamie@example.com", role: "USER",
      organizationId: "org_1", expiresAt: new Date(Date.now() + 86400000), usedAt: null,
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/.../orphan.jpg", publicId: "headshots/orphan",
    });
    inviteUpdateMany.mockResolvedValueOnce({ count: 0 });
    cloudinaryDeleteImage.mockRejectedValueOnce(new Error("cloudinary unavailable"));

    await expect(POST(makeReq(baseBody), await ctx())).rejects.toThrow(
      "Headshot cleanup queued",
    );
    expect(mediaCleanupUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { publicId: "headshots/orphan" },
      create: expect.objectContaining({ status: "PENDING" }),
    }));
  });

  // SP-7 Seam F — server-side magic-byte + size gates (rule 11).

  it("returns 400 when headshotDataUrl bytes are not a JPEG or PNG", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    // PDF magic %PDF wrapped in a JPEG-looking data URL prefix.
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
    const spoofed = `data:image/jpeg;base64,${pdfBytes.toString("base64")}`;
    const res = await POST(
      makeReq({ ...baseBody, headshotDataUrl: spoofed }),
      await ctx(),
    );
    expect(res.status).toBe(400);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
  });

  it(
    "returns 400 when headshotDataUrl decoded size exceeds 6MB",
    async () => {
      inviteFindUnique.mockResolvedValueOnce({
        id: "inv_1",
        token: INVITE_TOKEN,
        email: "jamie@example.com",
        role: "USER",
        organizationId: "org_1",
        expiresAt: new Date(Date.now() + 86400000),
        usedAt: null,
      });
      const oversize = Buffer.alloc(6_500_000);
      oversize[0] = 0xff;
      oversize[1] = 0xd8;
      oversize[2] = 0xff;
      const big = `data:image/jpeg;base64,${oversize.toString("base64")}`;
      const res = await POST(
        makeReq({ ...baseBody, headshotDataUrl: big }),
        await ctx(),
      );
      expect(res.status).toBe(400);
      expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
    },
    15_000,
  );
});
