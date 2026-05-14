import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const validateCsrf = vi.fn();
const inviteFindUnique = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const inviteUpdate = vi.fn();
const sendInviteEmail = vi.fn();
const cloudinaryUploadDataUrl = vi.fn();

vi.mock("@/lib/csrf", () => ({
  validateCsrf: (...a: unknown[]) => validateCsrf(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    // Existing route wraps user.create + invite.update in $transaction.
    // Pass-through so the unit mocks above still capture the calls.
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        userInvite: {
          findUnique: (...a: unknown[]) => inviteFindUnique(...a),
          update: (...a: unknown[]) => inviteUpdate(...a),
        },
        user: {
          findUnique: (...a: unknown[]) => userFindUnique(...a),
          create: (...a: unknown[]) => userCreate(...a),
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
  uploadDataUrl: (...a: unknown[]) => cloudinaryUploadDataUrl(...a),
}));

beforeEach(() => {
  validateCsrf.mockReset().mockReturnValue(null);
  inviteFindUnique.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  userUpdate.mockReset();
  inviteUpdate.mockReset();
  sendInviteEmail.mockReset();
  cloudinaryUploadDataUrl.mockReset();
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

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/invites/abc123", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function ctx() {
  return { params: Promise.resolve({ token: "abc123" }) };
}

describe("POST /api/invites/[token] (extended)", () => {
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

  it("creates User with phone + image when email-password happy path", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce(null); // email not yet exists
    cloudinaryUploadDataUrl.mockResolvedValueOnce(
      "https://res.cloudinary.com/.../jamie.jpg",
    );
    userCreate.mockResolvedValueOnce({
      id: "u_new",
      email: "jamie@example.com",
      name: "Jamie Tradie",
      role: "USER",
    });
    inviteUpdate.mockResolvedValueOnce({});

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
  });

  it("on provider:'google' path, skips password validation", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce({
      id: "u_existing_google",
      organizationId: "org_1",
      role: "USER",
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce(
      "https://res.cloudinary.com/.../jamie.jpg",
    );
    userUpdate.mockResolvedValueOnce({
      id: "u_existing_google",
      phone: "0412345678",
    });
    inviteUpdate.mockResolvedValueOnce({});

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
    expect(userUpdate).toHaveBeenCalled();
  });

  it("on provider:'google' path, returns 400 when no existing Google user found for this invite", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce(null); // user not found
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
    expect(res.status).toBe(400);
    expect(cloudinaryUploadDataUrl).not.toHaveBeenCalled();
  });

  // SP-7 Seam F — server-side magic-byte + size gates (rule 11).

  it("returns 400 when headshotDataUrl bytes are not a JPEG or PNG", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
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

  it("returns 400 when headshotDataUrl decoded size exceeds 6MB", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
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
  });
});
