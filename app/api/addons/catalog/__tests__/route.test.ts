import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: { featureEntitlement: { findMany: vi.fn() } },
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { GET } from "../route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";

const mockSession = getServerSession as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.featureEntitlement.findMany as ReturnType<
  typeof vi.fn
>;
const mockGetWorkspace = getWorkspaceForUser as ReturnType<typeof vi.fn>;

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

    // The entitlement query is workspace-scoped, active-only, and bounded (rule 3).
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws1", active: true }),
        select: { sku: true },
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
});
