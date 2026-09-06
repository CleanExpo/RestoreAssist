import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/prisma", () => ({
  prisma: { portalContent: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));

import { fetchPublishedPortalContent } from "../fetch-portal-content";

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

/**
 * The CLIENT_EDUCATION split is enforced in the QUERY. These assert the `where`
 * clause rather than the returned rows, because that is where the boundary
 * actually is — filtering in the component would still ship paid content to the
 * browser in the RSC payload.
 */
describe("fetchPublishedPortalContent — CLIENT_EDUCATION gate", () => {
  it("excludes add-on rows by default", async () => {
    await fetchPublishedPortalContent("customer");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requiresAddon: false }),
      }),
    );
  });

  // The default is the one that matters. Every future call site that forgets to
  // resolve the entitlement inherits it, so a missed gate degrades to showing
  // LESS rather than leaking the paid library.
  it("still excludes add-on rows when options are omitted entirely", async () => {
    await fetchPublishedPortalContent();

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.requiresAddon).toBe(false);
  });

  it("drops the filter only when the workspace is entitled", async () => {
    await fetchPublishedPortalContent("customer", { includeAddonContent: true });

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.requiresAddon).toBeUndefined();
    // The rest of the boundary must survive: an entitled client still only ever
    // sees PUBLISHED platform content for their own audience.
    expect(where.state).toBe("PUBLISHED");
    expect(where.audience).toBe("customer");
    expect(where.scope).toEqual({ in: ["PLATFORM_DEFAULT"] });
  });

  it("keeps the published/audience/scope boundary when unentitled too", async () => {
    await fetchPublishedPortalContent("customer", {
      includeAddonContent: false,
    });

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.state).toBe("PUBLISHED");
    expect(where.audience).toBe("customer");
    expect(where.scope).toEqual({ in: ["PLATFORM_DEFAULT"] });
  });
});
