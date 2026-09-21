/**
 * RA-7566 — GET /api/admin/evidence-review must not return another
 * organisation's inspections.
 *
 * Registration makes every business owner ADMIN of their own organisation
 * (`app/api/auth/register/route.ts`). verifyAdminFromDb only re-checks that
 * role. Before this fix the Prisma `where` filtered by workflow / search /
 * technician / jobType / status and never by organisation, so any tenant
 * admin could read every inspection on the platform.
 *
 * This suite plants two inspections (org A and org B) in an in-memory store
 * and applies the handler's actual `where` to them. That is what makes the
 * suite fail on current main: the unfixed query has no organisation
 * predicate, so both rows come back. A where-shape assertion alone cannot
 * prove the HTTP body excludes tenant B.
 *
 * CLEAR bar: foreign identifiers must be absent from the response body,
 * headers, and error text. If a foreign row still reaches the handler the
 * only allowed answers are 403 or 404 — never a 200 that contains it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const inspectionFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
    inspection: {
      findMany: (...args: unknown[]) => inspectionFindMany(...args),
    },
  },
}));

import { GET } from "../route";

const ORG_A = "org-a-ra7566";
const ORG_B = "org-b-ra7566";
const ADMIN_A = "admin-a-ra7566";
const ADMIN_B = "admin-b-ra7566";

const FOREIGN_MARKERS = [
  "insp-b",
  "NIR-2026-09-BBBB",
  "Tenant B Street, Brisbane",
  ORG_B,
  ADMIN_B,
];

const planted = [
  inspectionRow({
    id: "insp-a",
    userId: ADMIN_A,
    organizationId: ORG_A,
    inspectionNumber: "NIR-2026-09-AAAA",
    propertyAddress: "Tenant A Street",
  }),
  inspectionRow({
    id: "insp-b",
    userId: ADMIN_B,
    organizationId: ORG_B,
    inspectionNumber: "NIR-2026-09-BBBB",
    propertyAddress: "Tenant B Street, Brisbane",
  }),
];

function inspectionRow(input: {
  id: string;
  userId: string;
  organizationId: string;
  inspectionNumber: string;
  propertyAddress: string;
}) {
  return {
    id: input.id,
    userId: input.userId,
    organizationId: input.organizationId,
    user: { organizationId: input.organizationId },
    workspace: { members: [] as Array<{ userId: string }> },
    inspectionNumber: input.inspectionNumber,
    propertyAddress: input.propertyAddress,
    technicianName: "Pat Technician",
    status: "DRAFT",
    inspectionDate: new Date("2026-09-01T00:00:00Z"),
    submittedAt: null,
    updatedAt: new Date("2026-09-19T00:00:00Z"),
    inspectionWorkflow: {
      id: `wf-${input.id}`,
      jobType: "water",
      experienceLevel: "EXPERIENCED",
      totalSteps: 4,
      completedSteps: 1,
      skippedSteps: 0,
      isReadyToSubmit: false,
      submissionScore: 40,
      lastValidatedAt: null,
      startedAt: new Date("2026-09-01T00:00:00Z"),
      completedAt: null,
      steps: [],
    },
    _count: { evidenceItems: 0 },
  };
}

function collectStrings(node: unknown, key: string, acc: string[] = []): string[] {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectStrings(item, key, acc);
    return acc;
  }
  const rec = node as Record<string, unknown>;
  const value = rec[key];
  if (typeof value === "string" && value.length > 0) acc.push(value);
  for (const child of Object.values(rec)) collectStrings(child, key, acc);
  return acc;
}

/**
 * Apply the handler's Prisma `where` to the planted rows. Missing
 * organisation / owner predicates mean "no tenant filter" — that is the
 * defect — so both plants survive. A real organisation id in the where
 * keeps only matching rows.
 */
function applyWhere(where: unknown) {
  const orgIds = collectStrings(where, "organizationId");
  const userIds = collectStrings(where, "userId");
  const hasTenantPredicate = orgIds.length > 0 || userIds.length > 0;

  return planted.filter((row) => {
    if (!hasTenantPredicate) return true;
    return orgIds.includes(row.organizationId) || userIds.includes(row.userId);
  });
}

function request(url = "http://localhost/api/admin/evidence-review?status=all") {
  return new NextRequest(url);
}

function signInAsOrgAAdmin() {
  getServerSession.mockResolvedValue({
    user: { id: ADMIN_A, role: "ADMIN" },
  });
  userFindUnique.mockResolvedValue({
    id: ADMIN_A,
    role: "ADMIN",
    organizationId: ORG_A,
  });
}

async function assertNoForeignLeak(res: Response, body: unknown) {
  const serialized = JSON.stringify(body);
  const headerBlob = [...res.headers.entries()].flat().join("\n");
  for (const marker of FOREIGN_MARKERS) {
    expect(serialized).not.toContain(marker);
    expect(headerBlob).not.toContain(marker);
  }
}

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  inspectionFindMany.mockReset();
  inspectionFindMany.mockImplementation((args: { where?: unknown }) =>
    Promise.resolve(applyWhere(args?.where)),
  );
  vi.unstubAllEnvs();
});

describe("GET /api/admin/evidence-review (RA-7566)", () => {
  it("returns 401 when there is no session", async () => {
    getServerSession.mockResolvedValue(null);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(inspectionFindMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("returns 403 for a non-admin session", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "user-1", role: "USER" },
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(inspectionFindMany).not.toHaveBeenCalled();
    await assertNoForeignLeak(res, body);
  });

  it("hides a second-tenant inspection from a business-owner admin", async () => {
    signInAsOrgAAdmin();

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(inspectionFindMany).toHaveBeenCalled();

    const ids = (body.inspections as Array<{ id: string }>).map((row) => row.id);
    const addresses = (
      body.inspections as Array<{ propertyAddress: string }>
    ).map((row) => row.propertyAddress);

    // Control: the probe can see the caller's own planted job. An empty
    // list would also make tenant B "absent" and would not prove isolation.
    expect(ids).toContain("insp-a");
    expect(addresses).toContain("Tenant A Street");
    expect(body.summary.totalWithWorkflow).toBe(1);

    expect(ids).not.toContain("insp-b");
    expect(addresses).not.toContain("Tenant B Street, Brisbane");
    await assertNoForeignLeak(res, body);
  });

  it("keeps the other tenant absent when search would match its address", async () => {
    // The search box assigns `where.OR`. A tenancy filter placed on OR is
    // overwritten (D-023). Searching for the foreign suburb is what makes
    // that failure visible.
    signInAsOrgAAdmin();

    const res = await GET(
      request(
        "http://localhost/api/admin/evidence-review?status=all&search=Brisbane",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    const ids = (body.inspections as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain("insp-b");
    expect(ids).toContain("insp-a");
    await assertNoForeignLeak(res, body);
  });

  it("fails closed with 403 and no foreign markers if the query still returns tenant B", async () => {
    signInAsOrgAAdmin();
    inspectionFindMany.mockImplementation(() => Promise.resolve(planted));

    const res = await GET(request());
    const body = await res.json();

    expect([403, 404]).toContain(res.status);
    expect(body.inspections).toBeUndefined();
    expect(body.summary).toBeUndefined();
    expect(body.error).toBe("Forbidden");
    await assertNoForeignLeak(res, body);
  });

  it("does not 403 the list when a workspace-reachable job is in another organisation", async () => {
    signInAsOrgAAdmin();
    const workspaceSharedB = {
      ...planted[1],
      workspace: { members: [{ userId: ADMIN_A }] },
    };
    inspectionFindMany.mockImplementation(() =>
      Promise.resolve([planted[0], workspaceSharedB]),
    );

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    const ids = (body.inspections as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain("insp-a");
    expect(ids).toContain("insp-b");
  });

  it("does not show organisation B's job to an org-less admin", async () => {
    getServerSession.mockResolvedValue({
      user: { id: ADMIN_A, role: "ADMIN" },
    });
    userFindUnique.mockResolvedValue({
      id: ADMIN_A,
      role: "ADMIN",
      organizationId: null,
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    const ids = (body.inspections as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain("insp-a");
    expect(ids).not.toContain("insp-b");
    await assertNoForeignLeak(res, body);
  });
});
