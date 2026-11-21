import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const assertInspectionReadable = vi.fn();
const inspectionFindUnique = vi.fn();
const profileFindUnique = vi.fn();
const userFindUnique = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://restoreassist.app/" }));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionReadable: (...a: unknown[]) => assertInspectionReadable(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: (...a: unknown[]) => inspectionFindUnique(...a) },
    contractorProfile: { findUnique: (...a: unknown[]) => profileFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

import { GET } from "../route";

const ctx = { params: Promise.resolve({ id: "insp1" }) };
const req = () => new NextRequest("http://localhost/api/inspections/insp1/next-service");
const CATALOGUE = JSON.stringify({ v: 1, services: ["carpet-cleaning", "upholstery-cleaning", "duct-cleaning"], custom: [] });

beforeEach(() => {
  vi.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "tech1" } });
  assertInspectionReadable.mockResolvedValue({ ok: true, data: { id: "insp1", userId: "tech1", workspaceId: "ws1" } });
  inspectionFindUnique.mockResolvedValue({
    claimType: "WATER",
    client: { name: "Citizen Household", contactPerson: "Jo Citizen" },
    workspace: { ownerId: "owner1" },
  });
  profileFindUnique.mockResolvedValue({ slug: "harbour-restorations", servicesOffered: CATALOGUE, isPubliclyVisible: true });
  userFindUnique.mockResolvedValue({ businessName: "Harbour Restorations" });
});

describe("GET /api/inspections/[id]/next-service (RA-8220)", () => {
  it("drafts a follow-up from the workspace owner's catalogue, with the card link", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(profileFindUnique.mock.calls[0][0].where).toEqual({ userId: "owner1" });
    expect(json.services.map((s: { id: string }) => s.id)).toEqual(["carpet-cleaning", "upholstery-cleaning"]);
    expect(json.businessCardUrl).toBe("https://restoreassist.app/contractors/harbour-restorations");
    expect(json.draft.body).toMatch(/^Hi Jo,/);
    expect(json.draft.body).toContain(json.businessCardUrl);
  });

  it("uses the job owner when the job has no workspace", async () => {
    inspectionFindUnique.mockResolvedValue({ claimType: "WATER", client: null, workspace: null });
    await GET(req(), ctx);
    expect(profileFindUnique.mock.calls[0][0].where).toEqual({ userId: "tech1" });
  });

  it("omits the card link when the profile is hidden", async () => {
    profileFindUnique.mockResolvedValue({ slug: "x", servicesOffered: CATALOGUE, isPubliclyVisible: false });
    const json = await (await GET(req(), ctx)).json();
    expect(json.businessCardUrl).toBeNull();
    expect(json.draft.body).not.toContain("/contractors/");
  });

  it("returns no draft when the business has no catalogue", async () => {
    profileFindUnique.mockResolvedValue(null);
    const json = await (await GET(req(), ctx)).json();
    expect(json).toMatchObject({ hasCatalogue: false, services: [], draft: null });
  });

  it("refuses another tenant's job and reads nothing", async () => {
    assertInspectionReadable.mockResolvedValue({ ok: false, status: 404, reason: "Inspection not found" });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect(inspectionFindUnique).not.toHaveBeenCalled();
  });

  it("is 401 without a session", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(401);
  });
});
