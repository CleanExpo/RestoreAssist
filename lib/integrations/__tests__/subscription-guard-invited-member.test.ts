/**
 * RA-7893 — checkIntegrationAccess reads the business owner's plan for an
 * invited technician or manager (subscriptionStatus null by design), and
 * resolves the Founding Trial grant from the workspace the owner OWNS rather
 * than requiring a WorkspaceMember row that invite acceptance never creates.
 * Fails closed for a user removed from the organisation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  role: string;
  organizationId: string | null;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  subscriptionEndsAt: Date | null;
  trialEndsAt: Date | null;
  lifetimeAccess: boolean;
};

const db = vi.hoisted(() => ({
  users: {} as Record<string, Row>,
  grant: null as null | {
    active: boolean;
    stripePriceId: string;
    workspace: { ownerId: string; status: string };
  },
}));

vi.mock("@/lib/integrations/dev-mode", () => ({ isIntegrationDevMode: () => false }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          organization: u.organizationId ? { ownerId: "owner-a" } : null,
        };
      },
    },
    workspace: {
      findFirst: async ({ where }: { where: { ownerId: string; status: string } }) =>
        where.ownerId === "owner-a" && where.status === "READY"
          ? { id: "ws-a", name: "A" }
          : null,
    },
    // Invite acceptance never creates a membership row.
    workspaceMember: { findFirst: async () => null },
    featureEntitlement: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_sku: { workspaceId: string; sku: string } };
      }) =>
        where.workspaceId_sku.workspaceId === "ws-a" &&
        where.workspaceId_sku.sku === "BOOKKEEPING"
          ? db.grant
          : null,
    },
  },
}));

import { checkIntegrationAccess } from "../subscription-guard";

const FUTURE = new Date("2099-01-01");
const PAST = new Date("2000-01-01");

function row(over: Partial<Row> & { id: string }): Row {
  return {
    role: "USER",
    organizationId: "org-a",
    subscriptionStatus: null,
    subscriptionPlan: null,
    subscriptionEndsAt: null,
    trialEndsAt: null,
    lifetimeAccess: false,
    ...over,
  };
}

beforeEach(() => {
  db.grant = null;
  db.users = {
    "owner-a": row({
      id: "owner-a",
      role: "ADMIN",
      subscriptionStatus: "ACTIVE",
      subscriptionPlan: "monthly",
    }),
    "tech-a": row({ id: "tech-a" }),
    removed: row({ id: "removed", organizationId: null }),
  };
});

describe("checkIntegrationAccess — invited members (RA-7893)", () => {
  it("allows an invited technician when the owner's paid plan is ACTIVE", async () => {
    const res = await checkIntegrationAccess("tech-a", "xero");
    expect(res.isAllowed).toBe(true);
  });

  it("refuses the technician when the owner's paid plan has ended", async () => {
    db.users["owner-a"].subscriptionEndsAt = PAST;
    const res = await checkIntegrationAccess("tech-a", "xero");
    expect(res.isAllowed).toBe(false);
  });

  it("refuses the technician when the owner is CANCELED", async () => {
    db.users["owner-a"].subscriptionStatus = "CANCELED";
    const res = await checkIntegrationAccess("tech-a", "xero");
    expect(res.isAllowed).toBe(false);
  });

  it("uses the owner's Founding Trial grant without a membership row", async () => {
    db.users["owner-a"].subscriptionStatus = "TRIAL";
    db.users["owner-a"].trialEndsAt = FUTURE;
    db.grant = {
      active: true,
      stripePriceId: "complimentary:founding-trial",
      workspace: { ownerId: "owner-a", status: "READY" },
    };
    const res = await checkIntegrationAccess("tech-a", "xero");
    expect(res.isAllowed).toBe(true);
    expect(res.foundingTrialWorkspaceId).toBe("ws-a");
  });

  it("refuses a user removed from the organisation", async () => {
    const res = await checkIntegrationAccess("removed", "xero");
    expect(res.isAllowed).toBe(false);
  });
});
