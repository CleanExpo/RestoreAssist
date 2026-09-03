/**
 * RA-7423 — POST /api/auth/register must answer quickly even when the
 * post-signup notifications (welcome email, in-app notification, founder
 * alert, audit log, analytics) are slow.
 *
 * Measured on the founder's phone 03/09/2026: 15 s from "Create account" to
 * the dashboard; 39 s the night before on a desktop browser. The route
 * awaited every notification before responding (RA-1309 made them awaited
 * so rejections could not crash the process). The user row is committed
 * before any of them run, so nothing the customer sees depends on them.
 *
 * The fix keeps RA-1309's catch-everything shape but caps the wait: the
 * response goes out after SIDE_EFFECT_CAP_MS even if a send is still in
 * flight; the sends keep running to completion in the background.
 *
 * Same mock scaffold as route.test.ts; only the welcome-email ledger call is
 * made controllable so it can be held open.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
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
const deliverEmailOnce = vi.fn();
const notifyWelcome = vi.fn();
const sendFounderSignupAlert = vi.fn();
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
  deliverEmailOnce: (...args: unknown[]) => deliverEmailOnce(...args),
}));
vi.mock("@/lib/email-retry", () => ({ sendWithRetry: vi.fn() }));
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
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    userInvite: { findFirst: (...args: unknown[]) => userInviteFindFirst(...args) },
    organization: { create: vi.fn() },
    $transaction: (...args: unknown[]) => prismaTransaction(...args),
  },
}));

import { POST } from "../route";

const CAP_MS = 3_000; // mirrors SIDE_EFFECT_CAP_MS in the route
const HANG_MS = 60_000;

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
  applyRateLimit.mockResolvedValue(null);
  verifyBotId.mockResolvedValue({ ok: true });
  rejectIfBreached.mockResolvedValue(null);
  deliverEmailOnce.mockResolvedValue({ messageId: "welcome-1", replayed: false });
  notifyWelcome.mockResolvedValue(undefined);
  sendFounderSignupAlert.mockResolvedValue({ sent: true });
  logSecurityEvent.mockResolvedValue(undefined);
  track.mockResolvedValue(undefined);
  userInviteFindFirst.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  txUserCreate.mockResolvedValue({ id: "user-1" });
  txOrgCreate.mockResolvedValue({ id: "org-1" });
  txUserUpdate.mockResolvedValue({
    id: "user-1",
    email: VALID_BODY.email,
    name: VALID_BODY.name,
    organizationId: "org-1",
    subscriptionStatus: "TRIAL",
    creditsRemaining: 50,
  });
  prismaTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      user: { create: txUserCreate, update: txUserUpdate },
      organization: { create: txOrgCreate },
      userInvite: { findFirst: userInviteFindFirst },
      $executeRaw: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/auth/register — answers before slow notifications finish (RA-7423)", () => {
  it("responds within the cap when the welcome email send hangs", async () => {
    vi.useFakeTimers();
    let welcomeResolved = false;
    deliverEmailOnce.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            welcomeResolved = true;
            resolve({ messageId: "late", replayed: false });
          }, HANG_MS),
        ),
    );

    let response: Response | undefined;
    const pending = POST(makeRequest(VALID_BODY)).then((r) => {
      response = r;
      return r;
    });

    await vi.advanceTimersByTimeAsync(CAP_MS + 200);
    expect(response, "the sign-up response is still held by the email send").toBeDefined();
    expect(response!.status).toBe(201);
    expect(welcomeResolved).toBe(false);

    // The send is not abandoned: it still completes in the background.
    await vi.advanceTimersByTimeAsync(HANG_MS);
    expect(welcomeResolved).toBe(true);
    await pending;
  });

  it("still waits for fast notifications, so nothing changes on a healthy day", async () => {
    const order: string[] = [];
    deliverEmailOnce.mockImplementation(async () => {
      order.push("welcome");
      return { messageId: "welcome-1", replayed: false };
    });
    notifyWelcome.mockImplementation(async () => {
      order.push("notify");
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(order).toEqual(expect.arrayContaining(["welcome", "notify"]));
  });

  it("a rejected notification never turns a created account into an error", async () => {
    deliverEmailOnce.mockRejectedValue(new Error("mailtrap down"));
    sendFounderSignupAlert.mockRejectedValue(new Error("alert down"));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(txUserCreate).toHaveBeenCalledTimes(1);
  });
});
