/**
 * RA-7893 — invited technicians and managers read their business owner's
 * add-ons.
 *
 * Invite acceptance gives the new user an organizationId and a null
 * subscription, and never creates a WorkspaceMember row. Resolving the add-on
 * through `getWorkspaceForUser(technicianId)` therefore found no workspace and
 * every add-on read as "subscription required".
 *
 * Runs the REAL require-addon, organization-credits and provider-connections
 * code against an in-memory prisma fake, so the organisation boundary is
 * exercised rather than mocked away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: string;
  role: "ADMIN" | "MANAGER" | "USER";
  organizationId: string | null;
};

const db = vi.hoisted(() => ({
  users: {} as Record<string, UserRow>,
  orgs: {} as Record<string, { ownerId: string }>,
  workspaces: [] as Array<{
    id: string;
    name: string;
    ownerId: string;
    status: string;
  }>,
  members: [] as Array<{ userId: string; workspaceId: string; status: string }>,
  entitlements: [] as Array<{
    id: string;
    workspaceId: string;
    sku: string;
    active: boolean;
  }>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          subscriptionStatus: null,
          lifetimeAccess: false,
          organization: u.organizationId
            ? { ownerId: db.orgs[u.organizationId]?.ownerId ?? null }
            : null,
        };
      },
    },
    workspace: {
      findFirst: async ({
        where,
      }: {
        where: { ownerId: string; status: string };
      }) => {
        const w = db.workspaces.find(
          (x) => x.ownerId === where.ownerId && x.status === where.status,
        );
        return w ? { id: w.id, name: w.name } : null;
      },
    },
    workspaceMember: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; status: string };
      }) => {
        const m = db.members.find(
          (x) => x.userId === where.userId && x.status === where.status,
        );
        if (!m) return null;
        const w = db.workspaces.find((x) => x.id === m.workspaceId);
        return {
          workspace: w ? { id: w.id, name: w.name, status: w.status } : null,
        };
      },
    },
    featureEntitlement: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_sku: { workspaceId: string; sku: string } };
      }) => {
        const e = db.entitlements.find(
          (x) =>
            x.workspaceId === where.workspaceId_sku.workspaceId &&
            x.sku === where.workspaceId_sku.sku,
        );
        return e ? { id: e.id, active: e.active } : null;
      },
    },
  },
}));

import {
  getEntitlementWorkspaceForUser,
  isAddonEntitledForUser,
  requireAddon,
} from "../require-addon";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";

beforeEach(() => {
  db.users = {
    "owner-a": { id: "owner-a", role: "ADMIN", organizationId: "org-a" },
    "tech-a": { id: "tech-a", role: "USER", organizationId: "org-a" },
    "manager-a": { id: "manager-a", role: "MANAGER", organizationId: "org-a" },
    // Removed from org A: organizationId cleared, no subscription of their own.
    removed: { id: "removed", role: "USER", organizationId: null },
    "owner-b": { id: "owner-b", role: "ADMIN", organizationId: "org-b" },
    "tech-b": { id: "tech-b", role: "USER", organizationId: "org-b" },
  };
  db.orgs = {
    "org-a": { ownerId: "owner-a" },
    "org-b": { ownerId: "owner-b" },
  };
  db.workspaces = [
    { id: "ws-a", name: "A Restorations", ownerId: "owner-a", status: "READY" },
    { id: "ws-b", name: "B Restorations", ownerId: "owner-b", status: "READY" },
  ];
  db.members = [];
  db.entitlements = [
    { id: "fe-a1", workspaceId: "ws-a", sku: "CLIENT_COMMS", active: true },
    { id: "fe-a2", workspaceId: "ws-a", sku: "CLIENT_EDUCATION", active: true },
  ];
});

describe("requireAddon — invited members (RA-7893)", () => {
  it("allows an invited technician when the business owner has the add-on", async () => {
    const result = await requireAddon("tech-a", "CLIENT_COMMS");
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.workspaceId).toBe("ws-a");
  });

  it("allows an invited manager when the business owner has the add-on", async () => {
    const result = await requireAddon("manager-a", "CLIENT_COMMS");
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.workspaceId).toBe("ws-a");
  });

  it("still allows the owner themselves", async () => {
    const result = await requireAddon("owner-a", "CLIENT_COMMS");
    expect(result.allowed).toBe(true);
  });

  it("refuses with 402 once the user is removed from the organisation", async () => {
    const result = await requireAddon("removed", "CLIENT_COMMS");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("NO_WORKSPACE");
      expect(result.response.status).toBe(402);
    }
  });

  it("never lends org A's add-on to a technician in org B", async () => {
    const result = await requireAddon("tech-b", "CLIENT_COMMS");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("NOT_ENTITLED");
      expect(result.response.status).toBe(402);
    }
    await expect(getEntitlementWorkspaceForUser("tech-b")).resolves.toEqual({
      id: "ws-b",
      name: "B Restorations",
    });
  });
});

describe("requireAddon — membership rows never carry an add-on across tenants (RA-7893 review P1s)", () => {
  it("P1-CROSS-TENANT-ADDON: org A's owner being a member of org B's workspace does not lend org B's add-on", async () => {
    // Org A's own workspace is not READY; its owner holds an ACTIVE
    // membership in org B's workspace, which has CLIENT_COMMS.
    db.workspaces[0].status = "DISABLED";
    db.members = [{ userId: "owner-a", workspaceId: "ws-b", status: "ACTIVE" }];
    db.entitlements.push({
      id: "fe-b1",
      workspaceId: "ws-b",
      sku: "CLIENT_COMMS",
      active: true,
    });

    const result = await requireAddon("tech-a", "CLIENT_COMMS");
    expect(result.allowed).toBe(false);
    await expect(getEntitlementWorkspaceForUser("tech-a")).resolves.toBeNull();
  });

  it("P1-REMOVED-MEMBER-ADDON: a removed user's lingering membership in the former org's workspace grants nothing", async () => {
    db.members = [{ userId: "removed", workspaceId: "ws-a", status: "ACTIVE" }];

    const result = await requireAddon("removed", "CLIENT_COMMS");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.response.status).toBe(402);
    await expect(
      isAddonEntitledForUser("removed", "CLIENT_EDUCATION"),
    ).resolves.toBe(false);
  });
});

describe("getEntitlementWorkspaceForUser (RA-7893)", () => {
  it("resolves an invited technician to the owner's workspace", async () => {
    await expect(getEntitlementWorkspaceForUser("tech-a")).resolves.toEqual({
      id: "ws-a",
      name: "A Restorations",
    });
  });

  it("resolves nothing for a removed user", async () => {
    await expect(getEntitlementWorkspaceForUser("removed")).resolves.toBeNull();
  });
});

describe("getWorkspaceForUser is NOT widened (RA-7893)", () => {
  // Its other callers WRITE (provider API keys). Widening it would let a
  // technician write into the owner's workspace.
  it("still returns null for an invited technician", async () => {
    await expect(getWorkspaceForUser("tech-a")).resolves.toBeNull();
  });
});

describe("isAddonEntitledForUser — portal / client-surface read (RA-7893)", () => {
  it("reads the owner's add-on for a job created by an invited technician", async () => {
    await expect(
      isAddonEntitledForUser("tech-a", "CLIENT_EDUCATION"),
    ).resolves.toBe(true);
  });

  it("is false for a removed user and for another organisation", async () => {
    await expect(
      isAddonEntitledForUser("removed", "CLIENT_EDUCATION"),
    ).resolves.toBe(false);
    await expect(
      isAddonEntitledForUser("tech-b", "CLIENT_EDUCATION"),
    ).resolves.toBe(false);
  });
});
