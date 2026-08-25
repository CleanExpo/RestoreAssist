import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  userInvite: { findFirst: vi.fn() },
  user: { create: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
    callback(tx),
  ),
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: () => ({ linkAccount: vi.fn() }),
}));
vi.mock("next-auth/providers/google", () => ({
  default: (config: unknown) => ({ id: "google", ...config as object }),
}));
vi.mock("next-auth/providers/apple", () => ({
  default: (config: unknown) => ({ id: "apple", ...config as object }),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => config,
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  encryptAccountTokens: (account: unknown) => account,
}));
vi.mock("@/lib/security-audit", () => ({
  logSecurityEvent: vi.fn(),
  getAccountLockoutStatus: vi.fn().mockResolvedValue({ locked: false }),
}));
vi.mock("@/lib/billing/constants", () => ({ TRIAL_DAYS: 15 }));

import { authOptions } from "@/lib/auth";

describe("NextAuth OAuth account identity boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    tx.user.create.mockImplementation(async ({ data }) => ({ id: "u1", ...data }));
    prisma.user.findUnique.mockResolvedValue(null);
  });

  it.each(["google", "apple"])(
    "creates only an unassigned %s invite-pending identity for a canonical active invite",
    async () => {
      tx.userInvite.findFirst.mockResolvedValueOnce({ id: "invite1" });
      const createUser = authOptions.adapter?.createUser;
      expect(createUser).toBeTypeOf("function");

      await createUser!({
          name: "Invitee",
          email: "\uFEFFＡ@Example.COM\uFEFF",
          emailVerified: new Date(),
          image: null,
        });

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.userInvite.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: { equals: "a@example.com", mode: "insensitive" },
          }),
        }),
      );
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "a@example.com",
          role: "USER",
          organizationId: null,
          subscriptionStatus: null,
          creditsRemaining: null,
          needsOnboarding: true,
          pendingInviteIdentity: true,
        }),
      });
      expect(tx.user.create.mock.calls[0][0].data.trialEndsAt).toBeNull();
    },
  );

  it("retains the powerless invite identity through the adapter and createUser event", async () => {
    tx.userInvite.findFirst.mockResolvedValueOnce({ id: "invite1" });
    const created = await authOptions.adapter!.createUser!({
      name: "Invitee",
      email: "invitee@example.com",
      emailVerified: new Date(),
      image: null,
    });

    await authOptions.events!.createUser!({ user: created });

    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      role: "USER",
      organizationId: null,
      subscriptionStatus: null,
      creditsRemaining: null,
      pendingInviteIdentity: true,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does not promote a pending identity when its invite expires between adapter and event", async () => {
    tx.userInvite.findFirst.mockResolvedValueOnce({ id: "invite1" });
    const created = await authOptions.adapter!.createUser!({
      name: "Invitee",
      email: "invitee@example.com",
      emailVerified: new Date(),
      image: null,
    });

    // No event-time invite lookup exists: persisted identity state remains
    // authoritative even if the invite expires before this hook executes.
    await authOptions.events!.createUser!({ user: created });

    expect(created).toMatchObject({ pendingInviteIdentity: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(["google", "apple"])(
    "refuses direct %s OAuth for an enrolled 2FA account",
    async (provider) => {
      prisma.user.findUnique.mockResolvedValueOnce({ twoFactorEnabled: true });
      const result = await authOptions.callbacks!.signIn!({
        user: { id: "u-2fa", email: "two@example.com" },
        account: { provider } as any,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      });
      expect(result).toBe("/login?error=2FA_REQUIRED");
    },
  );

  it("allows direct OAuth for an account without enrolled 2FA", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ twoFactorEnabled: false });
    await expect(
      authOptions.callbacks!.signIn!({
        user: { id: "u-no-2fa", email: "plain@example.com" },
        account: { provider: "google" } as any,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(true);
  });

  it("canonicalises a non-invited OAuth identity without injecting owner entitlements", async () => {
    tx.userInvite.findFirst.mockResolvedValueOnce(null);
    const createUser = authOptions.adapter!.createUser!;
    await createUser({
      name: "New User",
      email: "\uFEFFＡ@Example.COM\uFEFF",
      emailVerified: new Date(),
      image: null,
    });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "a@example.com" }),
    });
    const data = tx.user.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("role");
    expect(data).not.toHaveProperty("subscriptionStatus");
  });
});
