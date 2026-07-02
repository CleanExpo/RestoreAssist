import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { GET, PATCH } from "../route";
import { prisma } from "@/lib/prisma";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));
import { getServerSession } from "next-auth";

describe.skipIf(!process.env.DATABASE_URL)("GET /api/setup/state", () => {
  let testUserId = "";
  let testOrgId = "";

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `state-${Date.now()}@test.com` },
    });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: {
        name: "State Test Co",
        ownerId: u.id,
        legalName: "State Test Pty Ltd",
        abn: "53004085616",
        state: "NSW",
      },
    });
    testOrgId = o.id;
    await prisma.user.update({
      where: { id: u.id },
      data: { organizationId: o.id },
    });
  });

  afterAll(async () => {
    await prisma.hydrationJob.deleteMany({
      where: { organizationId: testOrgId },
    });
    await prisma.organization
      .delete({ where: { id: testOrgId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    (getServerSession as any).mockResolvedValue({
      user: { id: testUserId, email: "t@t.com" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns organization snapshot with sections all PENDING when no jobs exist", async () => {
    await prisma.hydrationJob.deleteMany({
      where: { organizationId: testOrgId },
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.organization.legalName).toBe("State Test Pty Ltd");
    expect(json.data.organization.abn).toBe("53004085616");
    expect(json.data.sections.businessDetails).toBe("PENDING");
    expect(json.data.sections.branding).toBe("PENDING");
    expect(json.data.sections.pricing).toBe("PENDING");
  });

  it("reflects hydration job statuses in sections payload", async () => {
    await prisma.hydrationJob.deleteMany({
      where: { organizationId: testOrgId },
    });
    await prisma.hydrationJob.createMany({
      data: [
        { organizationId: testOrgId, kind: "ABR", status: "READY" },
        { organizationId: testOrgId, kind: "WEBSITE", status: "MANUAL" },
        { organizationId: testOrgId, kind: "PRICING", status: "RUNNING" },
      ],
    });
    const res = await GET();
    const json = await res.json();
    expect(json.data.sections.businessDetails).toBe("READY");
    expect(json.data.sections.branding).toBe("MANUAL");
    expect(json.data.sections.pricing).toBe("RUNNING");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("PATCH /api/setup/state", () => {
  let testUserId = "";
  let testOrgId = "";

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { email: `patch-state-${Date.now()}@test.com` },
    });
    testUserId = u.id;
    const o = await prisma.organization.create({
      data: {
        name: "Patch Test Co",
        ownerId: u.id,
        legalName: "Patch Test Pty Ltd",
        abn: "53004085616",
        state: "VIC",
      },
    });
    testOrgId = o.id;
    await prisma.user.update({
      where: { id: u.id },
      data: { organizationId: o.id },
    });
  });

  afterAll(async () => {
    await prisma.organization
      .delete({ where: { id: testOrgId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    (getServerSession as any).mockResolvedValue({
      user: { id: testUserId, email: "t@t.com" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (getServerSession as any).mockResolvedValue(null);
    const req = new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify({ primaryColor: "#ff0000" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body contains no patchable fields", async () => {
    const req = new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify({ unknownField: "value" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toMatch(/no patchable fields/i);
  });

  it("patches a single field and returns 200 with updated list", async () => {
    const req = new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify({ primaryColor: "#aabbcc" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.updated).toContain("primaryColor");
    const updated = await prisma.organization.findUnique({
      where: { id: testOrgId },
      select: { primaryColor: true },
    });
    expect(updated?.primaryColor).toBe("#aabbcc");
  });

  it("returns 409 when setup is already completed", async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { setupCompletedAt: new Date() },
    });
    const req = new Request("http://localhost/api/setup/state", {
      method: "PATCH",
      body: JSON.stringify({ primaryColor: "#000000" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(409);
    // Restore for any subsequent tests
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { setupCompletedAt: null },
    });
  });
});

// New-client startup hardening: the setup routes are owner-scoped
// (findFirst({ where: { ownerId } })), so one user can never mutate another
// tenant's org during setup. Prove that at the DB level.
describe.skipIf(!process.env.DATABASE_URL)(
  "PATCH /api/setup/state — tenant isolation",
  () => {
    let userAId = "";
    let orgAId = "";
    let userBId = "";
    let orgBId = "";
    let userCId = ""; // authenticated but owns no org

    beforeAll(async () => {
      const a = await prisma.user.create({
        data: { email: `iso-a-${Date.now()}@test.com` },
      });
      userAId = a.id;
      const oa = await prisma.organization.create({
        data: {
          name: "Iso A Co",
          ownerId: a.id,
          legalName: "Iso A",
          state: "NSW",
          primaryColor: "#aaaaaa",
        },
      });
      orgAId = oa.id;
      await prisma.user.update({
        where: { id: a.id },
        data: { organizationId: oa.id },
      });

      const b = await prisma.user.create({
        data: { email: `iso-b-${Date.now()}@test.com` },
      });
      userBId = b.id;
      const ob = await prisma.organization.create({
        data: {
          name: "Iso B Co",
          ownerId: b.id,
          legalName: "Iso B",
          state: "VIC",
          primaryColor: "#bbbbbb",
        },
      });
      orgBId = ob.id;
      await prisma.user.update({
        where: { id: b.id },
        data: { organizationId: ob.id },
      });

      const c = await prisma.user.create({
        data: { email: `iso-c-${Date.now()}@test.com` },
      });
      userCId = c.id;
    });

    afterAll(async () => {
      await prisma.organization
        .deleteMany({ where: { id: { in: [orgAId, orgBId] } } })
        .catch(() => {});
      await prisma.user
        .deleteMany({ where: { id: { in: [userAId, userBId, userCId] } } })
        .catch(() => {});
      await prisma.$disconnect();
    });

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("user B's PATCH mutates only B's org, never A's", async () => {
      (getServerSession as any).mockResolvedValue({
        user: { id: userBId, email: "b@t.com" },
      });
      const req = new Request("http://localhost/api/setup/state", {
        method: "PATCH",
        body: JSON.stringify({ primaryColor: "#123456" }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);

      const a = await prisma.organization.findUnique({
        where: { id: orgAId },
        select: { primaryColor: true },
      });
      const b = await prisma.organization.findUnique({
        where: { id: orgBId },
        select: { primaryColor: true },
      });
      expect(b?.primaryColor).toBe("#123456"); // B updated
      expect(a?.primaryColor).toBe("#aaaaaa"); // A untouched
    });

    it("an authenticated user who owns no org cannot patch anyone (404)", async () => {
      (getServerSession as any).mockResolvedValue({
        user: { id: userCId, email: "c@t.com" },
      });
      const req = new Request("http://localhost/api/setup/state", {
        method: "PATCH",
        body: JSON.stringify({ primaryColor: "#deadbe" }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(404);

      const a = await prisma.organization.findUnique({
        where: { id: orgAId },
        select: { primaryColor: true },
      });
      expect(a?.primaryColor).toBe("#aaaaaa"); // still untouched
    });
  },
);
