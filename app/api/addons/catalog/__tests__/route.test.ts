import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureEntitlement: { findMany: vi.fn() },
    user: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org1" }) },
  },
}));
vi.mock("@/lib/billing/technician-seats", () => ({
  technicianSeatUsage: vi.fn().mockResolvedValue({ purchased: 2, used: 1 }),
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));
// RA-7893: "owned" is read from the business owner's workspace.
vi.mock("@/lib/entitlements", () => ({
  getEntitlementWorkspaceForUser: vi.fn(),
}));
// RA-8466: who may buy follows refuseNonOwner's owner lookup.
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: vi.fn(),
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { getEntitlementWorkspaceForUser } from "@/lib/entitlements";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";
import { getOrganizationOwner } from "@/lib/organization-credits";
import { COMPLIMENTARY_PRICE_ID } from "@/lib/billing/founding-trial-grant";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.featureEntitlement.findMany as ReturnType<
  typeof vi.fn
>;
const mockCallerWorkspace = getWorkspaceForUser as ReturnType<typeof vi.fn>;
const mockGetWorkspace = getEntitlementWorkspaceForUser as ReturnType<
  typeof vi.fn
>;

const req = () =>
  new Request("http://localhost/api/addons/catalog") as unknown as Parameters<
    typeof GET
  >[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/addons/catalog", () => {
  it("401s when unauthenticated", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns every registry add-on with its real price + owned SKUs", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } });
    mockGetWorkspace.mockResolvedValue({ id: "ws1", name: "WS" });
    mockFindMany.mockResolvedValue([{ sku: "VOICE" }]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();

    // All registry add-ons are surfaced, with prices sourced from the SSOT.
    expect(json.addons).toHaveLength(Object.keys(RECURRING_ADDONS).length);
    for (const a of json.addons) {
      expect(typeof a.sku).toBe("string");
      expect(a.amount).toBeGreaterThan(0);
      expect(a.currency).toBeTruthy();
    }
    expect(json.owned).toEqual(["VOICE"]);
    // J-09: seats in use vs purchased for the caller's organisation.
    expect(json.technicianSeats).toEqual({ purchased: 2, used: 1 });

    // The entitlement query is workspace-scoped, active-only, and bounded (rule 3).
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws1", active: true }),
        select: { sku: true, stripePriceId: true, stripeSubscriptionId: true },
        take: 100,
      }),
    );
  });

  it("returns owned=[] when the user has no workspace (and never queries)", async () => {
    mockSession.mockResolvedValue({ user: { id: "u1" } });
    mockGetWorkspace.mockResolvedValue(null);

    const res = await GET(req());
    const json = await res.json();
    expect(json.owned).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("RA-7893: an invited technician sees the business owner's add-ons as owned", async () => {
    mockSession.mockResolvedValue({ user: { id: "tech-1" } });
    // The technician has no workspace of their own (invites create none).
    mockCallerWorkspace.mockResolvedValue(null);
    mockGetWorkspace.mockResolvedValue({ id: "ws-owner", name: "Owner" });
    mockFindMany.mockResolvedValue([{ sku: "CLIENT_COMMS" }]);

    const res = await GET(req());
    const json = await res.json();
    expect(mockGetWorkspace).toHaveBeenCalledWith("tech-1");
    expect(json.owned).toEqual(["CLIENT_COMMS"]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws-owner" }),
      }),
    );
  });

  describe("RA-8466: per-card label and action", () => {
    const mockOwner = getOrganizationOwner as ReturnType<typeof vi.fn>;
    const mockUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;
    const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    it("trial owner: seats can be bought, other packs are not available yet", async () => {
      mockSession.mockResolvedValue({ user: { id: "owner-1" } });
      mockGetWorkspace.mockResolvedValue({ id: "ws1" });
      mockFindMany.mockResolvedValue([]);
      mockUser.mockResolvedValue({
        organizationId: "org1",
        role: "ADMIN",
        subscriptionStatus: "TRIAL",
        trialEndsAt: inTenDays,
      });
      mockOwner.mockResolvedValue("owner-1");

      const json = await (await GET(req())).json();
      expect(json.canManageBilling).toBe(true);
      expect(json.access.TECHNICIAN_SEATS).toMatchObject({
        label: "optional_paid",
        action: "buy",
      });
      expect(json.access.VOICE).toMatchObject({
        label: "unavailable",
        action: "choose_plan",
      });
    });

    it("Founding Trial owner: every held pack is a complimentary pilot with no button", async () => {
      mockSession.mockResolvedValue({ user: { id: "owner-1" } });
      mockGetWorkspace.mockResolvedValue({ id: "ws1" });
      mockFindMany.mockResolvedValue(
        Object.keys(RECURRING_ADDONS).map((sku) => ({
          sku,
          stripePriceId: COMPLIMENTARY_PRICE_ID,
          stripeSubscriptionId: null,
        })),
      );
      mockUser.mockResolvedValue({
        organizationId: "org1",
        role: "ADMIN",
        subscriptionStatus: "TRIAL",
        trialEndsAt: inTenDays,
      });
      mockOwner.mockResolvedValue("owner-1");

      const json = await (await GET(req())).json();
      for (const sku of Object.keys(RECURRING_ADDONS)) {
        expect(json.access[sku]).toMatchObject({
          label: "complimentary_pilot",
          action: "none",
        });
      }
    });

    it("paid-plan owner: buy on unheld packs, manage on a paid pack", async () => {
      mockSession.mockResolvedValue({ user: { id: "owner-1" } });
      mockGetWorkspace.mockResolvedValue({ id: "ws1" });
      mockFindMany.mockResolvedValue([
        { sku: "VOICE", stripePriceId: "price_x", stripeSubscriptionId: "sub_1" },
      ]);
      mockUser.mockResolvedValue({
        organizationId: "org1",
        role: "ADMIN",
        subscriptionStatus: "ACTIVE",
        trialEndsAt: null,
      });
      mockOwner.mockResolvedValue("owner-1");

      const json = await (await GET(req())).json();
      expect(json.access.VOICE).toMatchObject({ label: "optional_paid", action: "manage" });
      expect(json.access.CLIENT_COMMS).toMatchObject({ label: "optional_paid", action: "buy" });
    });

    it("team member: no card offers a buy, add or manage action", async () => {
      mockSession.mockResolvedValue({ user: { id: "tech-1" } });
      mockGetWorkspace.mockResolvedValue({ id: "ws-owner" });
      mockFindMany.mockResolvedValue([
        { sku: "VOICE", stripePriceId: "price_x", stripeSubscriptionId: "sub_1" },
      ]);
      mockUser.mockResolvedValue({
        organizationId: "org1",
        role: "USER",
        subscriptionStatus: "ACTIVE",
        trialEndsAt: null,
      });
      mockOwner.mockResolvedValue("owner-1");

      const json = await (await GET(req())).json();
      expect(json.canManageBilling).toBe(false);
      for (const sku of Object.keys(RECURRING_ADDONS)) {
        expect(["ask_owner", "none"]).toContain(json.access[sku].action);
      }
    });
  });
});
