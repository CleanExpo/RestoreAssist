/**
 * RA-8404 — an address with an apostrophe or ampersand must be stored as
 * typed (canonicalised), so the same typed address can log in afterwards.
 *
 * Drives the real register handler, then the real credentials `authorize()`
 * closure from lib/auth.ts, against one in-memory user table. Before the fix
 * register stored `sean.o&#x27;brien@acme-restoration.com.au` and authorize looked up
 * `sean.o'brien@acme-restoration.com.au`, so login returned null.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const users = new Map<string, Record<string, unknown>>();
  return {
    users,
    findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
      users.get(where.email) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `user-${users.size + 1}`, twoFactorEnabled: false, ...data };
      users.set(data.email as string, row);
      return row;
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: h.findUnique, update: vi.fn(), updateMany: vi.fn() },
    userInvite: { findFirst: vi.fn(async () => null) },
    organization: { create: vi.fn() },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: vi.fn(),
        userInvite: { findFirst: vi.fn(async () => null) },
        user: {
          create: h.create,
          update: vi.fn(async ({ where }: { where: { id: string } }) =>
            [...h.users.values()].find((u) => u.id === where.id),
          ),
        },
        organization: { create: vi.fn(async () => ({ id: "org-1" })) },
      }),
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/auth/botid", () => ({ verifyBotId: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/auth/password-breach", () => ({ rejectIfBreached: vi.fn(async () => null) }));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: vi.fn(async () => ({ messageId: "m-1", replayed: false })),
}));
vi.mock("@/lib/email-retry", () => ({ sendWithRetry: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications", () => ({ notifyWelcome: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/founder-signup-alert", () => ({
  sendFounderSignupAlert: vi.fn(async () => ({ sent: true })),
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: vi.fn(async () => undefined),
  extractRequestContext: vi.fn(() => ({})),
  getAccountLockoutStatus: vi.fn(async () => ({ locked: false })),
}));
vi.mock("@/lib/workspace/provision", () => ({
  ensureWorkspaceForUser: vi.fn(async () => ({ workspaceId: "ws-1" })),
}));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn(async () => undefined) }));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/apple", () => ({ default: vi.fn(() => ({})) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => config,
}));
vi.mock("@/lib/auth/account-tokens", () => ({ encryptAccountTokens: (a: unknown) => a }));

import { POST } from "../route";
import { authOptions } from "@/lib/auth";

type AuthorizeFn = (
  credentials: Record<string, string>,
) => Promise<Record<string, unknown> | null>;

function authorize(): AuthorizeFn {
  const provider = (authOptions.providers as unknown as Array<Record<string, unknown>>)
    .find((p) => typeof p.authorize === "function");
  if (!provider) throw new Error("credentials provider not found");
  return provider.authorize as AuthorizeFn;
}

const PASSWORD = "correct horse battery staple";

function signup(email: string) {
  return POST(
    new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sean", email, password: PASSWORD, acceptedTerms: true }),
    }),
  );
}

beforeEach(() => {
  h.users.clear();
  vi.clearAllMocks();
});

describe("RA-8404 signup then login with the same typed address", () => {
  it.each([
    ["control", "Jane.Citizen@acme-restoration.com.au", "jane.citizen@acme-restoration.com.au"],
    ["apostrophe", "Sean.O'Brien@acme-restoration.com.au", "sean.o'brien@acme-restoration.com.au"],
    ["ampersand", "plumbing&gas@acme-restoration.com.au", "plumbing&gas@acme-restoration.com.au"],
  ])("%s: stores the canonical address and logs in", async (_case, typed, stored) => {
    const res = await signup(typed);
    expect(res.status).toBe(201);
    expect(h.create.mock.calls[0][0].data.email).toBe(stored);

    const user = await authorize()({ email: typed, password: PASSWORD });
    expect(user).not.toBeNull();
    expect(user?.email).toBe(stored);
  });

  it.each(["<b>x</b>@acme-restoration.com.au", 'quo"te@acme-restoration.com.au', "sp ace@acme-restoration.com.au"])(
    "refuses %s with 400 and stores nothing",
    async (typed) => {
      const res = await signup(typed);
      expect(res.status).toBe(400);
      expect(h.create).not.toHaveBeenCalled();
    },
  );
});
