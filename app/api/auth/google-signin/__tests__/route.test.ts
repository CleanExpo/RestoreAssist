import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyIdToken = vi.fn();
const inviteFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const executeRaw = vi.fn();
const deliverEmailOnce = vi.fn();

vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: vi.fn(async () => ({ verifyIdToken })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: (...args: unknown[]) => executeRaw(...args),
        userInvite: {
          findFirst: (...args: unknown[]) => inviteFindFirst(...args),
        },
        user: {
          findUnique: (...args: unknown[]) => userFindUnique(...args),
          create: (...args: unknown[]) => userCreate(...args),
          update: (...args: unknown[]) => userUpdate(...args),
        },
      }),
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/security-audit", () => ({
  extractRequestContext: vi.fn(() => ({})),
  logSecurityEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: (...args: unknown[]) => deliverEmailOnce(...args),
}));
vi.mock("@/lib/notifications", () => ({
  notifyWelcome: vi.fn(async () => undefined),
}));
vi.mock("@/lib/demo-data", () => ({
  seedDemoDataForNewUser: vi.fn(async () => undefined),
}));

import { POST } from "../route";

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/auth/google-signin", {
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
  executeRaw.mockResolvedValue(1);
  inviteFindFirst.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({
    id: "victim",
    email: "victim@example.com",
    name: "Victim",
    image: null,
    role: "ADMIN",
  });
  userUpdate.mockResolvedValue({
    id: "victim",
    email: "victim@example.com",
    name: "Victim",
    image: null,
    role: "ADMIN",
  });
  deliverEmailOnce.mockResolvedValue({ messageId: "welcome-1", replayed: false });
});

describe("Firebase Google identity boundary", () => {
  it("rejects client-asserted verification when the signed token is unverified", async () => {
    verifyIdToken.mockResolvedValue({
      email: "victim@example.com",
      email_verified: false,
      firebase: { sign_in_provider: "google.com" },
    });
    const response = await POST(request({ emailVerified: true }));
    expect(response.status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("rejects a non-Google Firebase provider even with an email claim", async () => {
    verifyIdToken.mockResolvedValue({
      email: "victim@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "password" },
    });
    const response = await POST(request({ emailVerified: true }));
    expect(response.status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("refuses owner signup while a live invitation owns the canonical email", async () => {
    verifyIdToken.mockResolvedValue({
      email: "Ｖictim@Example.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    });
    inviteFindFirst.mockResolvedValue({ id: "invite_1" });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(inviteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { equals: "victim@example.com", mode: "insensitive" },
        }),
      }),
    );
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("waits for durable welcome delivery before committing the serverless response", async () => {
    verifyIdToken.mockResolvedValue({
      email: "new@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    });
    userFindUnique.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({
      id: "new-user",
      email: "new@example.com",
      name: "New User",
      image: null,
      role: "ADMIN",
    });
    let releaseDelivery!: () => void;
    deliverEmailOnce.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseDelivery = () => resolve({ messageId: "welcome-1", replayed: false });
      }),
    );

    let responseCommitted = false;
    const pending = POST(request({ name: "New User" })).then((response) => {
      responseCommitted = true;
      return response;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(responseCommitted).toBe(false);

    releaseDelivery();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(deliverEmailOnce).toHaveBeenCalledOnce();
  });
});
