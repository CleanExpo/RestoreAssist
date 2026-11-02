import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  organization: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/workspace/provision", () => ({
  ensureWorkspaceForUser: vi.fn(async () => ({
    workspaceId: "ws1",
    workspaceName: "W",
    alreadyExisted: true,
  })),
}));

import {
  ensureOwnerOrganization,
  OwnerOrganizationRefused,
} from "../ensure-owner-organization";
import { ensureWorkspaceForUser } from "@/lib/workspace/provision";

const owner = {
  id: "u1",
  name: "Sam",
  role: "ADMIN",
  organizationId: null,
  pendingInviteIdentity: false,
};

describe("ensureOwnerOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
      fn(db),
    );
    db.user.findUnique.mockResolvedValue(owner);
    db.organization.findFirst.mockResolvedValue(null);
    db.organization.create.mockResolvedValue({ id: "org1" });
    db.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it("creates one organisation for an ADMIN with none and ensures the workspace", async () => {
    await expect(ensureOwnerOrganization("u1")).resolves.toBe("org1");
    expect(db.organization.create).toHaveBeenCalledTimes(1);
    expect(db.organization.create.mock.calls[0][0].data.ownerId).toBe("u1");
    expect(ensureWorkspaceForUser).toHaveBeenCalledWith("u1");
  });

  it("uses the business name it is given", async () => {
    await ensureOwnerOrganization("u1", { name: "Coastal Restoration" });
    expect(db.organization.create.mock.calls[0][0].data.name).toBe(
      "Coastal Restoration",
    );
  });

  it("writes the user data in the same transaction as the claim", async () => {
    await ensureOwnerOrganization("u1", {
      userData: { needsOnboarding: false },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { needsOnboarding: false },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a technician", { role: "USER" }],
    ["a manager", { role: "MANAGER" }],
    ["a removed technician", { role: "USER", organizationLeftAt: new Date() }],
    ["an empty role", { role: "" }],
    ["a pending invited identity", { pendingInviteIdentity: true }],
  ])("refuses %s and creates nothing", async (_label, override) => {
    db.user.findUnique.mockResolvedValue({ ...owner, ...override });
    await expect(ensureOwnerOrganization("u1")).rejects.toBeInstanceOf(
      OwnerOrganizationRefused,
    );
    expect(db.organization.create).not.toHaveBeenCalled();
  });

  it("returns the existing organisation without creating", async () => {
    db.user.findUnique.mockResolvedValue({ ...owner, organizationId: "org9" });
    await expect(ensureOwnerOrganization("u1")).resolves.toBe("org9");
    expect(db.organization.create).not.toHaveBeenCalled();
  });

  it("attaches the oldest owned organisation instead of creating a second", async () => {
    db.organization.findFirst.mockResolvedValue({ id: "org-owned" });
    await expect(ensureOwnerOrganization("u1")).resolves.toBe("org-owned");
    expect(db.organization.create).not.toHaveBeenCalled();
    expect(db.organization.findFirst.mock.calls[0][0]).toMatchObject({
      where: { ownerId: "u1" },
      orderBy: { createdAt: "asc" },
    });
    expect(db.user.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "u1", organizationId: null },
      data: { organizationId: "org-owned" },
    });
  });

  it("a lost claim rolls back and returns the winner's organisation, never throws", async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    db.user.findUnique
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce({ organizationId: "org-winner" });
    await expect(ensureOwnerOrganization("u1")).resolves.toBe("org-winner");
  });

  it("two tabs racing the workspace: the loser reads the winner's, never fails", async () => {
    const raced = new Prisma.PrismaClientKnownRequestError("slug taken", {
      code: "P2002",
      clientVersion: "test",
    });
    vi.mocked(ensureWorkspaceForUser).mockRejectedValueOnce(raced);
    await expect(ensureOwnerOrganization("u1")).resolves.toBe("org1");
    expect(ensureWorkspaceForUser).toHaveBeenCalledTimes(2);
  });

  it("any other workspace failure still surfaces", async () => {
    vi.mocked(ensureWorkspaceForUser).mockRejectedValueOnce(new Error("db down"));
    await expect(ensureOwnerOrganization("u1")).rejects.toThrow("db down");
    expect(ensureWorkspaceForUser).toHaveBeenCalledTimes(1);
  });
});
