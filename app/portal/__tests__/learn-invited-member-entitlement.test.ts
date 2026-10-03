/**
 * RA-7893 — the client-education kiosk reads the BUSINESS's add-on.
 *
 * `inspection.userId` is whoever created the job. When that is an invited
 * technician (no workspace row of their own, no WorkspaceMember row), the
 * add-on used to read as off and the homeowner got the free article set even
 * though the firm had paid for CLIENT_EDUCATION.
 *
 * The page runs for real; prisma is an in-memory fake and the entitlement,
 * organisation and workspace resolvers are the real modules.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublishedPortalContent = vi.fn();
const fetchTechnicianIdentity = vi.fn();

const db = vi.hoisted(() => ({
  inspectionUserId: "tech-a",
  inspectionCreatedAt: new Date("2026-06-01T00:00:00Z"),
  users: {} as Record<
    string,
    {
      id: string;
      role: string;
      organizationId: string | null;
      email: string;
      organizationLeftAt?: Date | null;
    }
  >,
  orgOwners: { "org-a": "owner-a", "org-b": "owner-b" } as Record<
    string,
    string
  >,
  // Accepted invites: who joined which organisation, and when.
  invites: [] as Array<{
    organizationId: string;
    acceptedUserId: string;
    usedAt: Date;
  }>,
  entitlements: [] as Array<{ workspaceId: string; active: boolean }>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: async () => ({
        userId: db.inspectionUserId,
        createdAt: db.inspectionCreatedAt,
        technicianId: null,
        technicianName: "Sam",
        user: { organization: { name: "A Restorations", logoUrl: null } },
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = db.users[where.id];
        if (!u) return null;
        return {
          ...u,
          organization: u.organizationId
            ? { ownerId: db.orgOwners[u.organizationId] }
            : null,
        };
      },
    },
    userInvite: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId?: string;
          usedAt?: { not: null; lte?: Date };
          OR: Array<{ acceptedUserId?: string | null }>;
        };
      }) => {
        const userId = where.OR[0].acceptedUserId;
        const lte = where.usedAt?.lte;
        const latest = db.invites
          .filter(
            (i) =>
              (where.organizationId === undefined ||
                i.organizationId === where.organizationId) &&
              (!lte || i.usedAt <= lte) &&
              i.acceptedUserId === userId,
          )
          .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime())[0];
        return latest
          ? {
              usedAt: latest.usedAt,
              organizationId: latest.organizationId,
              organization: { ownerId: db.orgOwners[latest.organizationId] },
            }
          : null;
      },
    },
    workspace: {
      findFirst: async ({ where }: { where: { ownerId: string } }) =>
        where.ownerId === "owner-a"
          ? { id: "ws-a", name: "A" }
          : where.ownerId === "owner-b"
            ? { id: "ws-b", name: "B" }
            : where.ownerId === "tech-a"
              ? { id: "ws-tech-a", name: "Personal" }
              : null,
    },
    workspaceMember: { findFirst: async () => null },
    featureEntitlement: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_sku: { workspaceId: string; sku: string } };
      }) => {
        if (where.workspaceId_sku.sku !== "CLIENT_EDUCATION") return null;
        const e = db.entitlements.find(
          (x) => x.workspaceId === where.workspaceId_sku.workspaceId,
        );
        return e ? { id: `fe-${e.workspaceId}`, active: e.active } : null;
      },
    },
  },
}));

vi.mock("@/lib/portal/resolve-portal-inspection", () => ({
  resolvePortalAccess: async () => ({
    kind: "inspection",
    inspectionId: "insp-1",
  }),
}));
vi.mock("@/lib/portal/fetch-portal-content", () => ({
  fetchPublishedPortalContent: (...a: unknown[]) =>
    fetchPublishedPortalContent(...a),
}));
vi.mock("@/lib/portal/fetch-technician-identity", () => ({
  fetchTechnicianIdentity: (...a: unknown[]) => fetchTechnicianIdentity(...a),
}));

import ClientLearnKioskPage from "@/app/portal/[token]/learn/page";

beforeEach(() => {
  fetchPublishedPortalContent.mockReset().mockResolvedValue([]);
  fetchTechnicianIdentity.mockReset().mockResolvedValue(null);
  db.inspectionUserId = "tech-a";
  db.inspectionCreatedAt = new Date("2026-06-01T00:00:00Z");
  db.entitlements = [{ workspaceId: "ws-a", active: true }];
  db.users = {
    "owner-a": {
      id: "owner-a",
      role: "ADMIN",
      organizationId: "org-a",
      email: "owner-a@example.com",
    },
    "tech-a": {
      id: "tech-a",
      role: "USER",
      organizationId: "org-a",
      email: "tech-a@example.com",
    },
    removed: {
      id: "removed",
      role: "USER",
      organizationId: null,
      email: "removed@example.com",
    },
  };
  // tech-a joined org A before the job was created.
  db.invites = [
    {
      organizationId: "org-a",
      acceptedUserId: "tech-a",
      usedAt: new Date("2026-05-01T00:00:00Z"),
    },
  ];
});

async function renderFor(userId: string) {
  db.inspectionUserId = userId;
  await ClientLearnKioskPage({ params: Promise.resolve({ token: "tok" }) });
  return fetchPublishedPortalContent.mock.calls[0][1];
}

describe("portal learn page — job created by an invited technician (RA-7893)", () => {
  it("serves the paid library when the business owner holds CLIENT_EDUCATION", async () => {
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: true });
  });

  it("still serves it for a job the owner created", async () => {
    expect(await renderFor("owner-a")).toEqual({ includeAddonContent: true });
  });

  it("falls back to the free set when the owner's add-on is inactive", async () => {
    db.entitlements = [{ workspaceId: "ws-a", active: false }];
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });

  it("falls back to the free set for a user no longer in the organisation", async () => {
    expect(await renderFor("removed")).toEqual({ includeAddonContent: false });
  });
});

describe("portal learn page — technician who moved organisations (RA-7893 P1-MOVED-MEMBER-PORTAL-ENTITLEMENT)", () => {
  function moveTechToOrgB() {
    // tech-a left org A and accepted an invite into org B on 1 July.
    db.users["tech-a"].organizationId = "org-b";
    db.invites.push({
      organizationId: "org-b",
      acceptedUserId: "tech-a",
      usedAt: new Date("2026-07-01T00:00:00Z"),
    });
    // Only org B holds CLIENT_EDUCATION.
    db.entitlements = [{ workspaceId: "ws-b", active: true }];
  }

  it("does not lend org B's add-on to an org A job whose creator has since moved to org B", async () => {
    moveTechToOrgB();
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });

  it("serves org B's add-on for a job the moved technician created after joining org B", async () => {
    moveTechToOrgB();
    db.inspectionCreatedAt = new Date("2026-07-02T00:00:00Z");
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: true });
  });

  it("falls back to the free set when the invited creator has no accepted invite on record", async () => {
    db.invites = [];
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });
});

describe("portal learn page — technician removed from org A (RA-7893 P1-REMOVED-MEMBER-OLD-JOB-USES-PERSONAL-ADDON)", () => {
  function removeTechFromOrgA(leftAt: Date | null) {
    // tech-a was removed from org A (organizationId cleared) and has a
    // personal READY workspace with CLIENT_EDUCATION. Org A does not.
    db.users["tech-a"].organizationId = null;
    db.users["tech-a"].organizationLeftAt = leftAt;
    db.entitlements = [{ workspaceId: "ws-tech-a", active: true }];
  }

  it("does not serve the ex-member's personal add-on on an org A job's portal", async () => {
    removeTechFromOrgA(new Date("2026-08-01T00:00:00Z"));
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });

  it("falls back to the free set for an old job when the removal has no leave date", async () => {
    removeTechFromOrgA(null);
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });

  it("serves the ex-member's own add-on on a job they created after leaving", async () => {
    removeTechFromOrgA(new Date("2026-08-01T00:00:00Z"));
    db.inspectionCreatedAt = new Date("2026-09-01T00:00:00Z");
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: true });
  });
});

describe("portal learn page — org A's owner deleted their account (RA-7893 P1-OWNER-DELETION-ERASES-TENANT-RECEIPT)", () => {
  function ownerDeleted() {
    // The cascade removed org A and its invites and cleared tech-a's
    // organizationId; account delete stamped the leave date. tech-a has a
    // personal READY workspace with CLIENT_EDUCATION.
    db.users["tech-a"].organizationId = null;
    db.users["tech-a"].organizationLeftAt = new Date("2026-08-01T00:00:00Z");
    db.invites = [];
    db.entitlements = [{ workspaceId: "ws-tech-a", active: true }];
  }

  it("does not serve the technician's personal add-on on an old org A job", async () => {
    ownerDeleted();
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });

  it("serves it on a job the technician made after the leave date", async () => {
    ownerDeleted();
    db.inspectionCreatedAt = new Date("2026-09-01T00:00:00Z");
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: true });
  });
});
