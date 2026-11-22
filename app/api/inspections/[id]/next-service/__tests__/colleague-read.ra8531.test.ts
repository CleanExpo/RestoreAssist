/**
 * RA-8531 — a colleague opening the owner's job can read the next-service
 * draft.
 *
 * The route is read-only (it drafts text and sends nothing), but it opened the
 * job with the WRITE gate `assertInspectionTenancy`, so a MANAGER in the same
 * organisation got 404 on every job page the owner created. It now opens the
 * job with `assertInspectionReadable`, the D-023 read reach, unchanged.
 *
 * The real tenancy module runs here; only the database is emulated. The job
 * belongs to OWNER in ORG. A `where` that pins a `userId` or an organisation
 * matches only when it names the owner or the owner's organisation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getServerSession,
  userFindUnique,
  inspectionFindFirst,
  inspectionFindUnique,
  profileFindUnique,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  inspectionFindFirst: vi.fn(),
  inspectionFindUnique: vi.fn(),
  profileFindUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://restoreassist.app" }));
vi.mock("@/lib/organization-credits", () => ({
  getMembershipStart: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: userFindUnique, findMany: vi.fn().mockResolvedValue([]) },
    inspection: { findFirst: inspectionFindFirst, findUnique: inspectionFindUnique },
    contractorProfile: { findUnique: profileFindUnique },
  },
}));

import { GET } from "../route";

const OWNER = "owner-1";
const ORG = "org_1";

const USERS: Record<
  string,
  { role: "USER" | "MANAGER" | "ADMIN"; organizationId: string | null; businessName?: string }
> = {
  [OWNER]: { role: "ADMIN", organizationId: ORG, businessName: "Harbour Restorations" },
  "manager-1": { role: "MANAGER", organizationId: ORG },
  "tech-1": { role: "USER", organizationId: ORG },
  "manager-other": { role: "MANAGER", organizationId: "org_2" },
  "admin-other": { role: "ADMIN", organizationId: "org_2" },
  "solo-1": { role: "MANAGER", organizationId: null },
};

const CATALOGUE = JSON.stringify({
  v: 1,
  services: ["carpet-cleaning", "upholstery-cleaning"],
  custom: [],
});

function signIn(id: string) {
  getServerSession.mockResolvedValue({ user: { id, role: USERS[id].role } });
}

const req = () => new NextRequest("http://localhost/api/inspections/insp_1/next-service");
const ctx = { params: Promise.resolve({ id: "insp_1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const u = USERS[args.where.id];
    return u
      ? {
          ...u,
          email: `${args.where.id}@example.com`,
          organizationLeftAt: null,
          organizationLeftId: null,
        }
      : null;
  });
  inspectionFindFirst.mockImplementation(async (args: { where: unknown }) => {
    const where = JSON.stringify(args.where);
    const pinned = where.includes('"userId"') || where.includes("organizationId");
    const matches =
      !pinned ||
      where.includes(`"userId":"${OWNER}"`) ||
      where.includes(`"organizationId":"${ORG}"`);
    return matches ? { id: "insp_1", userId: OWNER, workspaceId: null } : null;
  });
  inspectionFindUnique.mockResolvedValue({
    claimType: "WATER",
    client: { name: "Citizen Household", contactPerson: "Jo Citizen" },
    workspace: null,
  });
  profileFindUnique.mockResolvedValue({
    slug: "harbour-restorations",
    servicesOffered: CATALOGUE,
    isPubliclyVisible: true,
  });
});

describe("GET next-service for a colleague on the owner's job (RA-8531)", () => {
  it("the owner gets the draft", async () => {
    signIn(OWNER);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it("a MANAGER in the same organisation gets the owner's draft", async () => {
    signIn("manager-1");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    // The catalogue and business name are the job owner's, never the manager's.
    expect(profileFindUnique.mock.calls[0][0].where).toEqual({ userId: OWNER });
    expect(json.services.map((s: { id: string }) => s.id)).toEqual([
      "carpet-cleaning",
      "upholstery-cleaning",
    ]);
    expect(json.draft.body).toMatch(/^Hi Jo,/);
  });

  it("a technician (USER) in the same organisation keeps the read reach D-023 gives every role", async () => {
    signIn("tech-1");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  for (const outsider of ["manager-other", "admin-other", "solo-1"]) {
    it(`${outsider} (another organisation or none) gets an opaque 404 and nothing is read`, async () => {
      signIn(outsider);
      const res = await GET(req(), ctx);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Inspection not found" });
      expect(inspectionFindUnique).not.toHaveBeenCalled();
      expect(profileFindUnique).not.toHaveBeenCalled();
    });
  }

  it("a job that does not exist answers the same 404", async () => {
    signIn("manager-1");
    inspectionFindFirst.mockResolvedValue(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Inspection not found" });
  });
});
