/**
 * RA-6966 — POST /api/auth/register behavioural tests.
 *
 * Covers three properties that had no direct test coverage:
 *   1. RA-1340 timing-oracle mitigation — bcrypt.hash runs BEFORE the
 *      duplicate-email findUnique lookup, so both the "exists" and
 *      "doesn't exist" paths pay the same ~bcrypt-cost latency.
 *   2. Duplicate email -> 400 CONFLICT and no user is created.
 *   3. A successful signup grants the trial credit/subscription state
 *      (creditsRemaining, quickFillCreditsRemaining, subscriptionStatus:
 *      TRIAL, trialEndsAt) sourced from PRICING_CONFIG.free.
 *
 * All side-effecting collaborators (email, notifications, analytics,
 * security-audit, breach-check, bot-check) are mocked — only prisma,
 * bcrypt (to observe call order) and sanitize/pricing (pure, real) matter
 * for these assertions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const bcryptHash = vi.fn().mockResolvedValue("hashed-password");
const userFindUnique = vi.fn();
const userInviteFindFirst = vi.fn();
const txUserCreate = vi.fn();
const txOrgCreate = vi.fn();
const txUserUpdate = vi.fn();
const prismaTransaction = vi.fn();
const applyRateLimit = vi.fn();
const verifyBotId = vi.fn();
const rejectIfBreached = vi.fn();
const sendWithRetry = vi.fn();
const notifyWelcome = vi.fn();
const sendFounderSignupAlert = vi.fn().mockResolvedValue({ sent: true });
const logSecurityEvent = vi.fn();
const track = vi.fn();

vi.mock("bcryptjs", () => ({
  default: { hash: (...args: unknown[]) => bcryptHash(...args) },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: (...args: unknown[]) => verifyBotId(...args),
}));
vi.mock("@/lib/auth/password-breach", () => ({
  rejectIfBreached: (...args: unknown[]) => rejectIfBreached(...args),
}));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: vi.fn().mockResolvedValue({ messageId: "welcome-1", replayed: false }),
}));
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: (...args: unknown[]) => sendWithRetry(...args),
}));
vi.mock("@/lib/notifications", () => ({
  notifyWelcome: (...args: unknown[]) => notifyWelcome(...args),
}));
vi.mock("@/lib/email/founder-signup-alert", () => ({
  sendFounderSignupAlert: (...args: unknown[]) => sendFounderSignupAlert(...args),
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args),
  extractRequestContext: vi.fn(() => ({ ipAddress: "127.0.0.1" })),
}));
vi.mock("@/lib/analytics/track", () => ({
  track: (...args: unknown[]) => track(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    userInvite: {
      findFirst: (...args: unknown[]) => userInviteFindFirst(...args),
    },
    // Truthy so register/route.ts's `canCreateOrganization` gate takes the
    // $transaction branch, matching how the app actually runs.
    organization: { create: vi.fn() },
    $transaction: (...args: unknown[]) => prismaTransaction(...args),
  },
}));

import { POST } from "../route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_BODY = {
  name: "Jane Tech",
  email: "jane@example.com",
  password: "correct horse battery staple",
  acceptedTerms: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  bcryptHash.mockResolvedValue("hashed-password");
  applyRateLimit.mockResolvedValue(null); // not rate-limited
  verifyBotId.mockResolvedValue({ ok: true });
  rejectIfBreached.mockResolvedValue(null); // not a known-breached password
  sendWithRetry.mockResolvedValue(undefined);
  notifyWelcome.mockResolvedValue(undefined);
  sendFounderSignupAlert.mockResolvedValue({ sent: true });
  logSecurityEvent.mockResolvedValue(undefined);
  track.mockResolvedValue(undefined);
  userInviteFindFirst.mockResolvedValue(null);

  // $transaction runs the callback against a tx object backed by the same
  // spies, mirroring the real `prisma.$transaction(async (tx) => {...})`.
  prismaTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      user: { create: txUserCreate, update: txUserUpdate },
      organization: { create: txOrgCreate },
      userInvite: { findFirst: userInviteFindFirst },
      $executeRaw: vi.fn(),
    }),
  );
});

describe("POST /api/auth/register — RA-1340 timing-oracle mitigation", () => {
  it("hashes the password BEFORE checking whether the email already exists", async () => {
    userFindUnique.mockResolvedValue({ id: "existing-user" }); // duplicate path

    await POST(makeRequest(VALID_BODY));

    expect(bcryptHash).toHaveBeenCalledTimes(1);
    expect(userFindUnique).toHaveBeenCalledTimes(1);
    // Vitest's mock invocationCallOrder is a single monotonic counter shared
    // across every vi.fn() in the run, so comparing across two different
    // mocks is valid: a lower number means it was called earlier.
    expect(bcryptHash.mock.invocationCallOrder[0]).toBeLessThan(
      userFindUnique.mock.invocationCallOrder[0],
    );
  });
});

describe("POST /api/auth/register — duplicate email", () => {
  it("returns 400 CONFLICT and creates no user when the email already exists", async () => {
    userFindUnique.mockResolvedValue({ id: "existing-user" });

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("CONFLICT");
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(txUserCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register — retired invitation flow", () => {
  it.each([
    ["an invitation token", { inviteToken: "a".repeat(48) }],
    ["technician signup type", { signupType: "technician" }],
  ])("refuses %s before creating an ADMIN or organisation", async (_case, legacy) => {
    userFindUnique.mockResolvedValue(null);
    txUserCreate.mockResolvedValue({ id: "legacy-user" });
    txOrgCreate.mockResolvedValue({ id: "legacy-org" });
    txUserUpdate.mockResolvedValue({
      id: "legacy-user",
      email: VALID_BODY.email,
      role: "ADMIN",
      organizationId: "legacy-org",
    });
    const res = await POST(makeRequest({ ...VALID_BODY, ...legacy }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toBe(
      "Use the secure invitation link to join an organisation",
    );
    expect(bcryptHash).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(txUserCreate).not.toHaveBeenCalled();
    expect(txOrgCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register — active invitation identity", () => {
  it("refuses ADMIN/organisation creation when the normalized email has a live invite", async () => {
    userInviteFindFirst.mockResolvedValueOnce({ id: "invite_1" });

    const res = await POST(
      makeRequest({ ...VALID_BODY, email: "  Jane@Example.com  " }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.message).toContain("team invitation");
    expect(userInviteFindFirst).toHaveBeenCalledWith({
      where: {
        email: { equals: "jane@example.com", mode: "insensitive" },
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(bcryptHash).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
    expect(txUserCreate).not.toHaveBeenCalled();
    expect(txOrgCreate).not.toHaveBeenCalled();
  });

  it("does not block registration for an expired or consumed invite", async () => {
    userInviteFindFirst.mockResolvedValueOnce(null);
    userFindUnique.mockResolvedValueOnce(null);
    txUserCreate.mockResolvedValue({ id: "user-1" });
    txOrgCreate.mockResolvedValue({ id: "org-1" });
    txUserUpdate.mockResolvedValue({
      id: "user-1",
      email: VALID_BODY.email,
      organizationId: "org-1",
    });

    expect((await POST(makeRequest(VALID_BODY))).status).toBe(201);
  });

  it("re-checks the invite under the shared email lock before creating an ADMIN", async () => {
    userFindUnique.mockResolvedValue(null);
    userInviteFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "invite-created-during-race" });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it("stores the canonical lower-case email", async () => {
    userFindUnique.mockResolvedValue(null);
    txUserCreate.mockResolvedValue({ id: "u1", email: "mixed@example.com" });
    txOrgCreate.mockResolvedValue({ id: "org1" });
    txUserUpdate.mockResolvedValue({ id: "u1", email: "mixed@example.com" });
    const res = await POST(makeRequest({ ...VALID_BODY, email: " Mixed@Example.COM " }));
    expect(res.status).toBe(201);
    expect(txUserCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: "mixed@example.com" }),
    }));
  });
});

describe("POST /api/auth/register — trial credit grant", () => {
  it("creates the user with TRIAL subscription state sourced from PRICING_CONFIG.free", async () => {
    userFindUnique.mockResolvedValue(null); // no existing account
    txUserCreate.mockResolvedValue({ id: "user-1" });
    txOrgCreate.mockResolvedValue({ id: "org-1" });
    txUserUpdate.mockResolvedValue({
      id: "user-1",
      email: VALID_BODY.email,
      name: VALID_BODY.name,
      organizationId: "org-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 50,
      quickFillCreditsRemaining: 30,
    });

    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.user.email).toBe(VALID_BODY.email);

    expect(txUserCreate).toHaveBeenCalledTimes(1);
    const createData = (txUserCreate.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;
    expect(createData).toMatchObject({
      role: "ADMIN",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 50,
      totalCreditsUsed: 0,
      quickFillCreditsRemaining: 30,
      totalQuickFillUsed: 0,
    });
    expect(createData.trialEndsAt).toBeInstanceOf(Date);
    // 15-day trial (PRICING_CONFIG.free.trialDays) — allow a small execution
    // skew window rather than asserting an exact millisecond.
    const trialMs = (createData.trialEndsAt as Date).getTime() - Date.now();
    expect(trialMs).toBeGreaterThan(14 * 24 * 60 * 60 * 1000);
    expect(trialMs).toBeLessThanOrEqual(15 * 24 * 60 * 60 * 1000);

    // Org row is created and the user linked to it.
    expect(txOrgCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "user-1" }),
      }),
    );
    expect(txUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ organizationId: "org-1" }),
      }),
    );
  });
});

describe("POST /api/auth/register — founder signup alert (launch-night Unit 4)", () => {
  function seedHappyPath(email: string) {
    userFindUnique.mockResolvedValue(null);
    txUserCreate.mockResolvedValue({ id: "user-1" });
    txOrgCreate.mockResolvedValue({ id: "org-1" });
    txUserUpdate.mockResolvedValue({
      id: "user-1",
      email,
      name: VALID_BODY.name,
      organizationId: "org-1",
      subscriptionStatus: "TRIAL",
      creditsRemaining: 50,
      trialEndsAt: new Date("2026-09-09T00:00:00.000Z"),
    });
  }

  it("announces the new account to the founder with its identifying details", async () => {
    seedHappyPath("alerted@example.com");

    const res = await POST(
      makeRequest({ ...VALID_BODY, email: "alerted@example.com" }),
    );

    expect(res.status).toBe(201);
    expect(sendFounderSignupAlert).toHaveBeenCalledTimes(1);
    expect(sendFounderSignupAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "alerted@example.com",
        creditsRemaining: 50,
      }),
    );
  });

  it("still returns 201 when the alert REJECTS — signup must never depend on it", async () => {
    seedHappyPath("resilient@example.com");
    // A control that cannot fail is not a control: prove the swallow works by
    // making the alert throw, not by trusting that it never will.
    sendFounderSignupAlert.mockRejectedValueOnce(new Error("smtp exploded"));

    const res = await POST(
      makeRequest({ ...VALID_BODY, email: "resilient@example.com" }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).user.email).toBe("resilient@example.com");
  });
});
