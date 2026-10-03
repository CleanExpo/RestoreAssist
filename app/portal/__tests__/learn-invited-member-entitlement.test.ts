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
  users: {} as Record<
    string,
    { id: string; role: string; organizationId: string | null }
  >,
  entitlementActive: true,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: async () => ({
        userId: db.inspectionUserId,
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
          organization: u.organizationId ? { ownerId: "owner-a" } : null,
        };
      },
    },
    workspace: {
      findFirst: async ({ where }: { where: { ownerId: string } }) =>
        where.ownerId === "owner-a" ? { id: "ws-a", name: "A" } : null,
    },
    workspaceMember: { findFirst: async () => null },
    featureEntitlement: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_sku: { workspaceId: string; sku: string } };
      }) =>
        where.workspaceId_sku.workspaceId === "ws-a" &&
        where.workspaceId_sku.sku === "CLIENT_EDUCATION"
          ? { id: "fe-1", active: db.entitlementActive }
          : null,
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
  db.entitlementActive = true;
  db.users = {
    "owner-a": { id: "owner-a", role: "ADMIN", organizationId: "org-a" },
    "tech-a": { id: "tech-a", role: "USER", organizationId: "org-a" },
    removed: { id: "removed", role: "USER", organizationId: null },
  };
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
    db.entitlementActive = false;
    expect(await renderFor("tech-a")).toEqual({ includeAddonContent: false });
  });

  it("falls back to the free set for a user no longer in the organisation", async () => {
    expect(await renderFor("removed")).toEqual({ includeAddonContent: false });
  });
});
