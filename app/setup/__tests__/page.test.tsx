import { beforeEach, describe, expect, it, vi } from "vitest";

// redirect must throw, as the real one does, so nothing after it runs.
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/components/setup/SetupShell", () => ({ SetupShell: () => null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/organization/ensure-owner-organization", () => ({
  ensureOwnerOrganization: vi.fn(async () => "org1"),
  OwnerOrganizationRefused: class extends Error {},
}));

import SetupPage from "../page";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ensureOwnerOrganization } from "@/lib/organization/ensure-owner-organization";

const owner = {
  role: "ADMIN",
  needsOnboarding: false,
  pendingInviteIdentity: false,
};
const openOrg = {
  id: "org1",
  ownerId: "u1",
  country: "AU",
  setupStartedAt: null,
  setupCompletedAt: null,
  hydrationJobs: [],
};

describe("/setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "u1" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(owner as never);
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(
      openOrg as never,
    );
  });

  it("an owner with no organisation gets one and sees the wizard", async () => {
    const element = await SetupPage();
    expect(ensureOwnerOrganization).toHaveBeenCalledWith("u1");
    expect(prisma.organization.findUnique.mock.calls[0][0].where).toEqual({
      id: "org1",
    });
    expect(element).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("terms come first: needsOnboarding goes to terms before any write", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...owner,
      needsOnboarding: true,
    } as never);
    await expect(SetupPage()).rejects.toThrow(
      "REDIRECT:/onboarding/account-type",
    );
    expect(ensureOwnerOrganization).not.toHaveBeenCalled();
  });

  it.each([
    ["technician", { ...owner, role: "USER" }],
    ["manager", { ...owner, role: "MANAGER" }],
    ["invited identity", { ...owner, pendingInviteIdentity: true }],
    ["invited identity still flagged for terms", { ...owner, pendingInviteIdentity: true, needsOnboarding: true }],
  ])("%s goes to /dashboard and gets no organisation", async (_l, user) => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    await expect(SetupPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(ensureOwnerOrganization).not.toHaveBeenCalled();
  });

  it("a completed organisation goes to /dashboard", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      ...openOrg,
      setupCompletedAt: new Date(),
    } as never);
    await expect(SetupPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("an ADMIN in someone else's organisation goes to /dashboard, never /", async () => {
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      ...openOrg,
      ownerId: "someone-else",
    } as never);
    await expect(SetupPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("never sends anyone to the home page", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    await expect(SetupPage()).rejects.toThrow("REDIRECT:/login");
    for (const [path] of redirect.mock.calls) expect(path).not.toBe("/");
  });
});
