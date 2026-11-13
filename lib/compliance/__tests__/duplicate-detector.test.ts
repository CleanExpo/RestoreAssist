// RA-1131: Unit tests for detectDuplicateJob
// Covers: no siblings, high match, low match (different address), >4h apart, self-exclusion

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique, mockFindMany } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
    },
  },
}));

import { detectDuplicateJob } from "../duplicate-detector";

const BASE_DATE = new Date("2025-07-10T09:00:00Z");
const POSTCODE = "3000";
const ADDRESS = "42 Bourke Street, Melbourne VIC 3000";

function makeCurrentInspection(overrides: object = {}) {
  return {
    propertyAddress: ADDRESS,
    propertyPostcode: POSTCODE,
    inspectionDate: BASE_DATE,
    userId: "user-001",
    ...overrides,
  };
}

function makeSibling(overrides: object = {}) {
  return {
    id: "sibling-001",
    createdAt: new Date("2025-07-10T08:55:00Z"),
    technicianName: "Jane Smith",
    propertyAddress: ADDRESS,
    inspectionDate: BASE_DATE,
    ...overrides,
  };
}

describe("detectDuplicateJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no duplicates when there are no sibling inspections", async () => {
    mockFindUnique.mockResolvedValueOnce(makeCurrentInspection());
    mockFindMany.mockResolvedValueOnce([]);

    const result = await detectDuplicateJob("insp-001");

    expect(result.hasDuplicates).toBe(false);
    expect(result.candidates).toHaveLength(0);
    expect(result.mergeSuggestion).toBeNull();
  });

  it("returns high match score for sibling with same postcode, same address, and <1h apart", async () => {
    mockFindUnique.mockResolvedValueOnce(makeCurrentInspection());
    mockFindMany.mockResolvedValueOnce([
      makeSibling({
        inspectionDate: new Date(BASE_DATE.getTime() + 30 * 60 * 1000), // 30 min later
      }),
    ]);

    const result = await detectDuplicateJob("insp-001");

    expect(result.hasDuplicates).toBe(true);
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    // postcode (0.3) + exact address (0.5) + <2h (0.2) = 1.0 → capped at 1
    expect(candidate.matchScore).toBe(1);
    expect(candidate.matchReasons).toContain(`Same postcode: ${POSTCODE}`);
    expect(candidate.matchReasons).toContain("Exact address match");
    expect(candidate.matchReasons.some((r) => r.includes("0.5h"))).toBe(true);
    expect(result.mergeSuggestion).toContain("sibling-001");
  });

  it("does not include sibling as candidate when address differs (score < 0.5)", async () => {
    mockFindUnique.mockResolvedValueOnce(makeCurrentInspection());
    mockFindMany.mockResolvedValueOnce([
      makeSibling({
        propertyAddress: "99 Collins Street, Melbourne VIC 3000", // different address
        inspectionDate: new Date(BASE_DATE.getTime() + 3 * 60 * 60 * 1000), // 3h later (>2h — no time bonus)
      }),
    ]);

    const result = await detectDuplicateJob("insp-001");

    // Only postcode match (0.3) — no address match, no time bonus → score 0.3 < 0.5 threshold
    expect(result.hasDuplicates).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });

  it("does not include sibling >4h apart (filtered at DB query level)", async () => {
    // The DB query only returns siblings within ±4h. Simulate that by returning empty.
    mockFindUnique.mockResolvedValueOnce(makeCurrentInspection());
    mockFindMany.mockResolvedValueOnce([]); // DB filtered them out

    // Verify the findMany was called with the correct date range
    const result = await detectDuplicateJob("insp-001");

    expect(result.hasDuplicates).toBe(false);

    const findManyCall = mockFindMany.mock.calls[0][0];
    const where = findManyCall.where;
    expect(where.inspectionDate.gte.getTime()).toBe(
      BASE_DATE.getTime() - 4 * 60 * 60 * 1000,
    );
    expect(where.inspectionDate.lte.getTime()).toBe(
      BASE_DATE.getTime() + 4 * 60 * 60 * 1000,
    );
  });

  it("excludes the current inspection itself from candidates via DB where clause", async () => {
    mockFindUnique.mockResolvedValueOnce(makeCurrentInspection());
    mockFindMany.mockResolvedValueOnce([]); // self excluded at DB level

    await detectDuplicateJob("insp-self");

    const findManyCall = mockFindMany.mock.calls[0][0];
    expect(findManyCall.where.id).toEqual({ not: "insp-self" });
  });
});

// RA-8043c: siblings must come from the same firm. Applies the where the
// detector sends, as the database would, over inspections of two firms.
describe("detectDuplicateJob firm scope (RA-8043c)", () => {
  const rows = [
    { id: "own-other-tech", userId: "user-001", org: "org-a" },
    { id: "teammate-job", userId: "user-002", org: "org-a" },
    { id: "other-firm-job", userId: "user-900", org: "org-z" },
    { id: "solo-firm-job", userId: "user-901", org: null },
  ];
  type Where = { AND?: Array<Record<string, unknown>> };
  const matches = (scope: Record<string, unknown>, r: (typeof rows)[number]): boolean => {
    if ("OR" in scope) {
      return (scope.OR as Array<Record<string, unknown>>).some((s) => matches(s, r));
    }
    if ("userId" in scope) return r.userId === scope.userId;
    if ("user" in scope) {
      const org = (scope.user as { organizationId?: unknown }).organizationId;
      return r.org === org;
    }
    return true;
  };
  const fakeDb = async (args: { where: Where }) => {
    const scopes = args.where.AND ?? [];
    return rows
      .filter((r) => scopes.every((s) => matches(s, r)))
      .map((r) => makeSibling({ id: r.id, technicianName: `Tech ${r.id}` }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockImplementation(fakeDb);
  });

  it("never offers another firm's job as a duplicate [ra-8043c]", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeCurrentInspection({ user: { organizationId: "org-a" } }),
    );

    const result = await detectDuplicateJob("insp-001");
    const ids = result.candidates.map((c) => c.inspectionId);

    expect(ids).toContain("teammate-job");
    expect(ids).not.toContain("other-firm-job");
    expect(ids).not.toContain("solo-firm-job");
    expect(JSON.stringify(result)).not.toContain("Tech other-firm-job");
  });

  it("scopes an org-less firm to its own jobs, never every org-less firm [ra-8043c]", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeCurrentInspection({ user: { organizationId: null } }),
    );

    const result = await detectDuplicateJob("insp-001");
    const ids = result.candidates.map((c) => c.inspectionId);

    expect(ids).toEqual(["own-other-tech"]);
    expect(mockFindMany.mock.calls[0][0].where.AND).toEqual([
      { userId: "user-001" },
    ]);
  });

  it("sends the firm filter to the database, not only filtering afterwards [ra-8043c]", async () => {
    mockFindUnique.mockResolvedValueOnce(
      makeCurrentInspection({ user: { organizationId: "org-a" } }),
    );

    await detectDuplicateJob("insp-001");

    expect(mockFindMany.mock.calls[0][0].where.AND).toEqual([
      { OR: [{ userId: "user-001" }, { user: { organizationId: "org-a" } }] },
    ]);
  });
});
