import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    organization: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "../route";

const session = getServerSession as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  organization: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

type OrgRow = { id: string; ownerId?: string; createdAt?: Date; [k: string]: unknown };

/**
 * The organisations in the fake database, in the (arbitrary) order an
 * unordered query returns them. findFirst/findUnique answer from this list
 * the way Prisma would: a where clause filters, orderBy sorts, no orderBy
 * means "whatever comes first".
 */
let orgs: OrgRow[] = [];
let currentOrgId: string | null = null;

function filterOrgs(where: Record<string, unknown> = {}): OrgRow[] {
  return orgs.filter((o) =>
    Object.entries(where).every(([k, v]) => (o as Record<string, unknown>)[k] === v),
  );
}

function setOrgs(rows: OrgRow[], current: string | null = null) {
  orgs = rows.map((r) => ({ ownerId: "owner-1", ...r }));
  currentOrgId = current;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { id: "owner-1" } });
  setOrgs([]);
  p.user.findUnique.mockImplementation(async () => ({
    organizationId: currentOrgId,
  }));
  p.organization.findFirst.mockImplementation(
    async (args: { where?: Record<string, unknown>; orderBy?: unknown }) => {
      let rows = filterOrgs(args.where);
      if (args.orderBy) {
        rows = [...rows].sort(
          (a, b) =>
            (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
            a.id.localeCompare(b.id),
        );
      }
      return rows[0] ?? null;
    },
  );
  p.organization.findUnique.mockImplementation(
    async (args: { where: { id: string } }) =>
      orgs.find((o) => o.id === args.where.id) ?? null,
  );
});

const patch = (body: Record<string, unknown>) =>
  PATCH(
    new NextRequest("http://localhost/api/organization/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );

describe("GET /api/organization/profile", () => {
  it("returns profile for owner", async () => {
    setOrgs([{ id: "org-1", legalName: "Acme Pty Ltd", logoUrl: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.legalName).toBe("Acme Pty Ltd");
  });
});

describe("PATCH /api/organization/profile", () => {
  it("updates legal name after setup", async () => {
    setOrgs([{ id: "org-1" }]);
    p.organization.update.mockResolvedValue({
      legalName: "Fixed Name Pty Ltd",
      tradingName: null,
      state: "NSW",
      logoUrl: null,
      primaryColor: "#1C2E47",
      accentColor: "#8A6B4E",
      country: "AU",
      abn: null,
      nzbn: null,
    });
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ legalName: "Fixed Name Pty Ltd" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(p.organization.update).toHaveBeenCalled();
  });

  // RA-8503: the office inbox told when a technician submits a job visit.
  it("saves a trimmed office email", async () => {
    setOrgs([{ id: "org-1" }]);
    p.organization.update.mockResolvedValue({ email: "office@example.com" });
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ email: "  office@example.com " }),
      }),
    );
    expect(res.status).toBe(200);
    expect(p.organization.update.mock.calls[0][0].data).toEqual({
      email: "office@example.com",
    });
  });

  it("clears the office email so the owner's email is used", async () => {
    setOrgs([{ id: "org-1" }]);
    p.organization.update.mockResolvedValue({ email: null });
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ email: "" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(p.organization.update.mock.calls[0][0].data).toEqual({
      email: null,
    });
  });

  it("refuses an office email that is not an email address", async () => {
    setOrgs([{ id: "org-1" }]);
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ email: "not an email" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(p.organization.update).not.toHaveBeenCalled();
  });

  it("clears the office email when only spaces are sent", async () => {
    setOrgs([{ id: "org-1", email: "old@example.com" }]);
    p.organization.update.mockResolvedValue({ email: null });
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ email: "   " }),
      }),
    );
    expect(res.status).toBe(200);
    expect(p.organization.update.mock.calls[0][0].data).toEqual({ email: null });
  });

  it("an unchanged older office email does not block saving other fields", async () => {
    setOrgs([{ id: "org-1", email: "front desk" }]);
    p.organization.update.mockResolvedValue({});
    const res = await PATCH(
      new NextRequest("http://localhost/api/organization/profile", {
        method: "PATCH",
        body: JSON.stringify({ email: "front desk", tradingName: "Sample Restorations" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(p.organization.update).toHaveBeenCalled();
  });

  // RA-8516: a list or a doubled dot is not one valid office address.
  it.each([
    "office@example.com,other.invalid",
    "office@example..com",
    "office@example.com other@example.com",
  ])("refuses %j as an office email", async (email) => {
    setOrgs([{ id: "org-1", email: null }]);
    const res = await patch({ email });
    expect(res.status).toBe(400);
    expect(p.organization.update).not.toHaveBeenCalled();
  });
});

// RA-8516: one owner may own several organisations.
describe("organisation targeted for an owner of several", () => {
  const OLDER = { id: "org-old", createdAt: new Date("2025-01-01T00:00:00Z") };
  const NEWER = { id: "org-new", createdAt: new Date("2026-01-01T00:00:00Z") };

  it("PATCH saves to the organisation the owner is attached to", async () => {
    // Unordered, the database hands back org-old first.
    setOrgs([OLDER, NEWER], "org-new");
    p.organization.update.mockResolvedValue({});
    const res = await patch({ tradingName: "Sample Restorations" });
    expect(res.status).toBe(200);
    expect(p.organization.update.mock.calls[0][0].where).toEqual({ id: "org-new" });
  });

  it("PATCH falls back to the oldest owned organisation, whatever order the database returns", async () => {
    // Attached to an organisation they do not own; unordered, org-new comes first.
    setOrgs([NEWER, OLDER, { id: "org-theirs", ownerId: "someone-else" }], "org-theirs");
    p.organization.update.mockResolvedValue({});
    const res = await patch({ tradingName: "Sample Restorations" });
    expect(res.status).toBe(200);
    expect(p.organization.update.mock.calls[0][0].where).toEqual({ id: "org-old" });
  });

  it("GET reads the same organisation PATCH saves to", async () => {
    setOrgs(
      [
        { ...OLDER, legalName: "Old Pty Ltd" },
        { ...NEWER, legalName: "New Pty Ltd" },
      ],
      "org-new",
    );
    const res = await GET();
    expect((await res.json()).data.legalName).toBe("New Pty Ltd");
  });

  it("an owner of no organisation gets 404", async () => {
    setOrgs([{ id: "org-theirs", ownerId: "someone-else" }], "org-theirs");
    const res = await patch({ tradingName: "Sample Restorations" });
    expect(res.status).toBe(404);
    expect(p.organization.update).not.toHaveBeenCalled();
  });
});
