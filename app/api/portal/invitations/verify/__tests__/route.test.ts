/**
 * RA-8613 - the verify route recognises a stateless recovery link, and only
 * while it is genuine, unexpired and still matches the account's password.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const clientUserFindUnique = vi.hoisted(() => vi.fn());
const invitationFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientUser: { findUnique: clientUserFindUnique },
    portalInvitation: {
      findUnique: invitationFindUnique,
      update: vi.fn(),
    },
  },
}));

process.env.CLIENT_PORTAL_JWT_SECRET = "test-secret-at-least-32-chars-long!!";

import { GET } from "../route";
import { signRecoveryToken } from "@/lib/portal/recovery-token";

const OLD_HASH = "$2a$10$hash-for-the-forgotten-password";
const ACCOUNT = {
  clientId: "client_1",
  email: "homeowner@example.com",
  name: "Home Owner",
  passwordHash: OLD_HASH,
};

function token(now?: Date) {
  return signRecoveryToken(
    {
      clientUserId: "client_user_1",
      clientId: ACCOUNT.clientId,
      email: ACCOUNT.email,
      passwordHash: OLD_HASH,
    },
    now,
  );
}

function req(t: string) {
  return new NextRequest(
    `http://localhost/api/portal/invitations/verify?token=${encodeURIComponent(t)}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clientUserFindUnique.mockResolvedValue(ACCOUNT);
});

describe("verify: recovery link", () => {
  it("accepts a live link and says it is a recovery", async () => {
    const res = await GET(req(await token()));
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.recovery).toBe(true);
    expect(body.invitation.email).toBe(ACCOUNT.email);
    expect(invitationFindUnique).not.toHaveBeenCalled();
  });

  it("refuses an expired link", async () => {
    const issued = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const body = await (await GET(req(await token(issued)))).json();
    expect(body.valid).toBe(false);
  });

  it("refuses a link once the password has changed", async () => {
    const t = await token();
    clientUserFindUnique.mockResolvedValue({
      ...ACCOUNT,
      passwordHash: "$2a$10$the-newly-set-password-hash",
    });
    const body = await (await GET(req(t))).json();
    expect(body.valid).toBe(false);
  });

  it("refuses a link when the account's email is no longer the one it was sent to", async () => {
    const t = await token();
    clientUserFindUnique.mockResolvedValue({
      ...ACCOUNT,
      email: "someone-else@example.com",
    });
    const body = await (await GET(req(t))).json();
    expect(body.valid).toBe(false);
  });

  it("refuses a link when the account now belongs to another client", async () => {
    const t = await token();
    clientUserFindUnique.mockResolvedValue({ ...ACCOUNT, clientId: "client_2" });
    const body = await (await GET(req(t))).json();
    expect(body.valid).toBe(false);
  });

  it("refuses a link whose account is gone", async () => {
    const t = await token();
    clientUserFindUnique.mockResolvedValue(null);
    const body = await (await GET(req(t))).json();
    expect(body.valid).toBe(false);
  });
});
