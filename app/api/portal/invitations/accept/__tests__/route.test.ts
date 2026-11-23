/**
 * RA-8613 — a homeowner who already has a portal account gets back in by
 * accepting a recovery invitation emailed to the account's address.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const invitationFindUnique = vi.hoisted(() => vi.fn());
const invitationUpdate = vi.hoisted(() => vi.fn());
const invitationUpdateMany = vi.hoisted(() => vi.fn());
const clientUserFindUnique = vi.hoisted(() => vi.fn());
const clientUserUpdate = vi.hoisted(() => vi.fn());
const clientUserCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    portalInvitation: {
      update: invitationUpdate,
      updateMany: invitationUpdateMany,
    },
    clientUser: { update: clientUserUpdate, create: clientUserCreate },
  };
  return {
    prisma: {
      portalInvitation: {
        findUnique: invitationFindUnique,
        update: invitationUpdate,
      },
      clientUser: { findUnique: clientUserFindUnique },
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

const TOKEN = "c" + "a".repeat(24);
const OLD_HASH = "$2a$10$hash-for-the-forgotten-password";
const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

const ACCOUNT = {
  id: "client_user_1",
  clientId: "client_1",
  email: "homeowner@example.com",
  name: "Home Owner",
  passwordHash: OLD_HASH,
};

function invitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv_recovery",
    token: TOKEN,
    email: "Homeowner@Example.com",
    clientId: "client_1",
    status: "PENDING",
    expiresAt: FUTURE,
    client: { id: "client_1", name: "Home Owner" },
    ...overrides,
  };
}

function req() {
  return new NextRequest("http://localhost/api/portal/invitations/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: TOKEN,
      password: "a-new-password",
      name: "Home Owner",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clientUserFindUnique.mockResolvedValue(ACCOUNT);
  invitationUpdateMany.mockResolvedValue({ count: 1 });
  clientUserUpdate.mockImplementation(
    async ({ data }: { data: { passwordHash: string } }) => ({
      ...ACCOUNT,
      passwordHash: data.passwordHash,
    }),
  );
});

describe("POST /api/portal/invitations/accept — account recovery (RA-8613)", () => {
  it("sets a new password for the account holder and signs them in", async () => {
    invitationFindUnique.mockResolvedValue(invitation());

    const res = await POST(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(clientUserCreate).not.toHaveBeenCalled();
    expect(invitationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "inv_recovery",
          status: "PENDING",
        }),
        data: expect.objectContaining({ status: "ACCEPTED" }),
      }),
    );
    const written = clientUserUpdate.mock.calls[0][0].data.passwordHash;
    expect(written).not.toBe(OLD_HASH);
  });

  it("makes a token issued before recovery stale", async () => {
    invitationFindUnique.mockResolvedValue(invitation());
    const oldFingerprint = credentialFingerprint(OLD_HASH);

    await POST(req());

    const newHash = clientUserUpdate.mock.calls[0][0].data.passwordHash;
    expect(credentialFingerprintMatches(oldFingerprint, newHash)).toBe(false);
    expect(credentialFingerprintMatches(oldFingerprint, OLD_HASH)).toBe(true);
  });

  it("refuses a link that was already used", async () => {
    invitationFindUnique.mockResolvedValue(
      invitation({ status: "ACCEPTED" }),
    );

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect(clientUserUpdate).not.toHaveBeenCalled();
  });

  it("refuses the second of two simultaneous uses of one link", async () => {
    invitationFindUnique.mockResolvedValue(invitation());
    invitationUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invitation already accepted" });
    expect(clientUserUpdate).not.toHaveBeenCalled();
  });

  it("refuses an expired link", async () => {
    invitationFindUnique.mockResolvedValue(invitation({ expiresAt: PAST }));

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invitation has expired" });
    expect(clientUserUpdate).not.toHaveBeenCalled();
  });

  it("refuses an invitation sent to a different address than the account", async () => {
    invitationFindUnique.mockResolvedValue(
      invitation({ email: "someone-else@example.com" }),
    );

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect(clientUserUpdate).not.toHaveBeenCalled();
    expect(invitationUpdateMany).not.toHaveBeenCalled();
  });
});
