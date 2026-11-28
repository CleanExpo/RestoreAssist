/**
 * RA-8613 - a homeowner who already has a portal account gets back in with a
 * stateless signed recovery link emailed to the account's address. Nothing is
 * stored for the link, so no invitation row and no contractor-visible API
 * carries it; it is dead once the password changes.
 */
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const invitationFindUnique = vi.hoisted(() => vi.fn());
const invitationUpdate = vi.hoisted(() => vi.fn());
const clientUserFindUnique = vi.hoisted(() => vi.fn());
const clientUserUpdate = vi.hoisted(() => vi.fn());
const clientUserUpdateMany = vi.hoisted(() => vi.fn());
const clientUserCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    portalInvitation: { update: invitationUpdate },
    clientUser: { create: clientUserCreate },
  };
  return {
    prisma: {
      portalInvitation: {
        findUnique: invitationFindUnique,
        update: invitationUpdate,
      },
      clientUser: {
        findUnique: clientUserFindUnique,
        update: clientUserUpdate,
        updateMany: clientUserUpdateMany,
      },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";

import { POST } from "../route";
import {
  credentialFingerprint,
  credentialFingerprintMatches,
} from "@/lib/portal/credential-fingerprint";
import { signClientPortalJwt } from "@/lib/portal/client-jwt";
import { signRecoveryToken } from "@/lib/portal/recovery-token";

const OLD_HASH = "$2a$10$hash-for-the-forgotten-password";

const ACCOUNT = {
  id: "client_user_1",
  clientId: "client_1",
  email: "homeowner@example.com",
  name: "Home Owner",
  passwordHash: OLD_HASH,
};

function recoveryToken(overrides: Partial<typeof ACCOUNT> = {}, now?: Date) {
  return signRecoveryToken(
    {
      clientUserId: ACCOUNT.id,
      clientId: ACCOUNT.clientId,
      email: ACCOUNT.email,
      passwordHash: OLD_HASH,
      ...overrides,
    },
    now,
  );
}

function req(token: string, body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/portal/invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password: "a-new-password", ...body }),
  });
}

function claimsOf(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  clientUserFindUnique.mockResolvedValue(ACCOUNT);
  clientUserUpdateMany.mockResolvedValue({ count: 1 });
});

describe("accept: recovery link for an existing account", () => {
  it("sets the new password, compare-and-set on the old hash, and signs the homeowner in", async () => {
    const res = await POST(req(await recoveryToken()));
    expect(res.status).toBe(200);

    expect(clientUserUpdateMany).toHaveBeenCalledTimes(1);
    const args = clientUserUpdateMany.mock.calls[0][0];
    // Only the account the link names, and only while its hash is still the
    // one the link was issued for.
    expect(args.where).toEqual({ id: ACCOUNT.id, passwordHash: OLD_HASH });
    expect(args.data.passwordHash).not.toBe(OLD_HASH);
    expect(await bcrypt.compare("a-new-password", args.data.passwordHash)).toBe(
      true,
    );
    expect(args.data.mustChangePassword).toBe(false);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.clientUser.email).toBe(ACCOUNT.email);
    // The session handed back is bound to the NEW password.
    const cfp = claimsOf(body.token).cfp as string;
    expect(credentialFingerprintMatches(cfp, args.data.passwordHash)).toBe(true);
    expect(credentialFingerprintMatches(cfp, OLD_HASH)).toBe(false);
  });

  it("needs no name; the account already has one", async () => {
    const res = await POST(req(await recoveryToken()));
    expect(res.status).toBe(200);
  });

  it("refuses a password shorter than 8 characters and changes nothing", async () => {
    const res = await POST(req(await recoveryToken(), { password: "short" }));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  // Guard: expired links cannot be revived.
  it("refuses an expired link", async () => {
    const issued = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const res = await POST(req(await recoveryToken({}, issued)));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  // Guard: a claimed link cannot be revived. Setting the password changes the
  // stored hash, so a link issued for the old hash no longer matches.
  it("refuses a link once the password has changed since it was issued", async () => {
    const token = await recoveryToken();
    clientUserFindUnique.mockResolvedValue({
      ...ACCOUNT,
      passwordHash: "$2a$10$the-newly-set-password-hash",
    });
    const res = await POST(req(token));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  // Guard: two simultaneous uses of one link cannot both set a password.
  it("refuses the second of two simultaneous uses", async () => {
    clientUserUpdateMany.mockResolvedValue({ count: 0 });
    const res = await POST(req(await recoveryToken()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.token).toBeUndefined();
  });

  it("refuses a link whose account no longer exists", async () => {
    clientUserFindUnique.mockResolvedValue(null);
    const res = await POST(req(await recoveryToken()));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a link when the account's email is no longer the one it was sent to", async () => {
    clientUserFindUnique.mockResolvedValue({
      ...ACCOUNT,
      email: "someone-else@example.com",
    });
    const res = await POST(req(await recoveryToken()));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a link when the account now belongs to another client", async () => {
    clientUserFindUnique.mockResolvedValue({
      ...ACCOUNT,
      clientId: "client_2",
    });
    const res = await POST(req(await recoveryToken()));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a link whose signature has been altered", async () => {
    const token = await recoveryToken();
    const [h, p, s] = token.split(".");
    const forged = `${h}.${p}.${s.slice(0, -2)}${s.endsWith("A") ? "BB" : "AA"}`;
    const res = await POST(req(forged));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a link re-pointed at another account", async () => {
    const token = await recoveryToken();
    const [h, p, s] = token.split(".");
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    payload.sub = "client_user_2";
    const swapped = `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s}`;
    const res = await POST(req(swapped));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  // Guard: the portal session token is a JWT under the same secret. It must
  // never work as a recovery link, or a stolen session could rewrite the password.
  it("refuses a portal session token presented as a recovery link", async () => {
    const session = await signClientPortalJwt({
      clientUserId: ACCOUNT.id,
      clientId: ACCOUNT.clientId,
      email: ACCOUNT.email,
      name: ACCOUNT.name,
      passwordHash: OLD_HASH,
    });
    const res = await POST(req(session));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
  });

  it("binds the link to the password it was issued for", async () => {
    const claims = claimsOf(await recoveryToken());
    expect(claims.cfp).toBe(credentialFingerprint(OLD_HASH));
    expect(claims.cfp).not.toBe(credentialFingerprint("$2a$10$another-hash"));
    // The bcrypt hash itself never enters the link.
    expect(JSON.stringify(claims)).not.toContain(OLD_HASH);
  });
});

describe("accept: an invitation can no longer reset an existing account", () => {
  // RA-8613 round 1 (P0): an invitation for an existing account could set its
  // password, and the contractor could read that invitation's token. An
  // invitation for an address that already has an account must be refused.
  const INVITE_TOKEN = "c" + "a".repeat(24);

  it("refuses an invitation to an address that already has an account", async () => {
    invitationFindUnique.mockResolvedValue({
      id: "inv_1",
      token: INVITE_TOKEN,
      email: ACCOUNT.email,
      clientId: ACCOUNT.clientId,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      client: { id: ACCOUNT.clientId, name: ACCOUNT.name },
    });
    const res = await POST(req(INVITE_TOKEN, { name: "Anyone" }));
    expect(res.status).toBe(400);
    expect(clientUserUpdateMany).not.toHaveBeenCalled();
    expect(clientUserUpdate).not.toHaveBeenCalled();
    expect(clientUserCreate).not.toHaveBeenCalled();
  });
});
