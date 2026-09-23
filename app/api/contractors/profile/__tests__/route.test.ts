import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RA-7723: the workspace owner (User.role "ADMIN" — D-023, every
// self-registered owner) must be able to create and reload their contractor
// profile. The PUT guard used to compare against "CONTRACTOR", a value the
// Role enum (USER | ADMIN | MANAGER) has never had, so every save was 403.
//
// The REAL lib/api-errors envelope is used on purpose so these tests assert
// the shape the browser actually receives: { error: { code, message } }.

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const profileFindUnique = vi.fn();
const profileUpsert = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    contractorProfile: {
      findUnique: (...a: unknown[]) => profileFindUnique(...a),
      upsert: (...a: unknown[]) => profileUpsert(...a),
    },
  },
}));

import { GET, PUT } from "../route";

const URL = "http://localhost/api/contractors/profile";

function putReq(body: unknown) {
  return new NextRequest(URL, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  publicDescription: "Water damage restoration, Brisbane north",
  yearsInBusiness: 12,
  teamSize: 6,
  isPubliclyVisible: true,
  specializations: ["Water damage", "Mould"],
};

// In-memory stand-in for the ContractorProfile table, keyed by userId, so a
// PUT followed by a GET round-trips through the same handlers.
let rows: Map<string, Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  profileFindUnique.mockImplementation(
    async (args: { where: { userId?: string; slug?: string } }) => {
      if (args.where.slug !== undefined) {
        for (const r of rows.values()) {
          if (r.slug === args.where.slug) return r;
        }
        return null;
      }
      return rows.get(args.where.userId as string) ?? null;
    },
  );
  profileUpsert.mockImplementation(
    async (args: {
      where: { userId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const existing = rows.get(args.where.userId);
      // RA-7728: ContractorProfile.slug is @unique — mirror the database
      // and reject a second row with the same slug the way Prisma does.
      if (!existing) {
        for (const r of rows.values()) {
          if (r.slug === args.create.slug) {
            throw Object.assign(new Error("Unique constraint failed"), {
              code: "P2002",
            });
          }
        }
      }
      const next = existing
        ? { ...existing, ...args.update }
        : { id: `cp_${args.where.userId}`, ...args.create };
      rows.set(args.where.userId, next);
      return next;
    },
  );
});

describe("/api/contractors/profile (RA-7723)", () => {
  it("GET with no profile row yet returns 200 and an empty profile, not an error", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner1" } });
    const res = await GET(new NextRequest(URL));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile).toBeNull();
  });

  it("workspace owner (ADMIN): first PUT creates the row, GET returns the same values", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner1" } });
    userFindUnique.mockResolvedValue({
      role: "ADMIN",
      businessName: "Acme Restoration",
    });

    const put = await PUT(putReq(VALID_BODY));
    expect(put.status).toBe(200);

    // Tenant-scoped: created for the session user, nobody else.
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    const upsertArgs = profileUpsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ userId: "owner1" });
    expect(upsertArgs.create.userId).toBe("owner1");

    const get = await GET(new NextRequest(URL));
    expect(get.status).toBe(200);
    const { profile } = await get.json();
    expect(profile).toMatchObject({
      publicDescription: VALID_BODY.publicDescription,
      yearsInBusiness: 12,
      teamSize: 6,
      isPubliclyVisible: true,
      specializations: ["Water damage", "Mould"],
    });
  });

  it("workspace owner (ADMIN): second PUT updates the same row", async () => {
    getServerSession.mockResolvedValue({ user: { id: "owner1" } });
    userFindUnique.mockResolvedValue({ role: "ADMIN", businessName: "Acme" });

    expect((await PUT(putReq(VALID_BODY))).status).toBe(200);
    expect(
      (await PUT(putReq({ ...VALID_BODY, teamSize: 9 }))).status,
    ).toBe(200);

    const { profile } = await (await GET(new NextRequest(URL))).json();
    expect(profile.teamSize).toBe(9);
    expect(rows.size).toBe(1);
  });

  it("technician (USER) gets 403 with a JSON error message and nothing is written", async () => {
    getServerSession.mockResolvedValue({ user: { id: "tech1" } });
    userFindUnique.mockResolvedValue({ role: "USER", businessName: null });

    const res = await PUT(putReq(VALID_BODY));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(typeof json.error.message).toBe("string");
    expect(json.error.message.length).toBeGreaterThan(0);
    expect(profileUpsert).not.toHaveBeenCalled();
  });

  it("manager (MANAGER) is not widened in: 403", async () => {
    getServerSession.mockResolvedValue({ user: { id: "mgr1" } });
    userFindUnique.mockResolvedValue({ role: "MANAGER", businessName: null });

    const res = await PUT(putReq(VALID_BODY));
    expect(res.status).toBe(403);
    expect(profileUpsert).not.toHaveBeenCalled();
  });

  it("role is read from the DB, not the JWT: a stale ADMIN claim for a USER row is 403", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u9", role: "ADMIN" } });
    userFindUnique.mockResolvedValue({ role: "USER", businessName: null });

    const res = await PUT(putReq(VALID_BODY));
    expect(res.status).toBe(403);
    expect(profileUpsert).not.toHaveBeenCalled();
  });

  it("unauthenticated PUT and GET are 401", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await PUT(putReq(VALID_BODY))).status).toBe(401);
    expect((await GET(new NextRequest(URL))).status).toBe(401);
  });
});

// RA-7728: the public slug comes from businessName and is unique. Two
// different owners whose businesses share a name (or who have no name yet)
// used to get a 409 on their FIRST save.
describe("/api/contractors/profile slug uniqueness (RA-7728)", () => {
  async function saveAs(userId: string, businessName: string | null) {
    getServerSession.mockResolvedValue({ user: { id: userId } });
    userFindUnique.mockResolvedValue({ role: "ADMIN", businessName });
    return PUT(putReq(VALID_BODY));
  }

  it("two owners with the same business name both save and get different slugs", async () => {
    const a = await saveAs("ownerA", "Acme Restoration");
    const b = await saveAs("ownerB", "Acme Restoration");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const slugA = rows.get("ownerA")?.slug;
    const slugB = rows.get("ownerB")?.slug;
    expect(slugA).toBe("acme-restoration");
    expect(typeof slugB).toBe("string");
    expect(slugB).toMatch(/^acme-restoration-/);
    expect(slugB).not.toBe(slugA);
  });

  it("three owners with the same name all save with three distinct slugs", async () => {
    for (const id of ["o1", "o2", "o3"]) {
      expect((await saveAs(id, "Acme")).status).toBe(200);
    }
    const slugs = ["o1", "o2", "o3"].map((id) => rows.get(id)?.slug);
    expect(new Set(slugs).size).toBe(3);
  });

  it("after 20 numbered slugs are taken the next owner gets a random suffix, still 200", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `many${i}`);
    for (const id of ids) {
      expect((await saveAs(id, "Acme")).status).toBe(200);
    }
    const slugs = ids.map((id) => rows.get(id)?.slug);
    expect(new Set(slugs).size).toBe(21);
    expect(slugs[19]).toBe("acme-20");
    expect(slugs[20]).toMatch(/^acme-[0-9a-f]{8}$/);
  });

  it("two owners with a blank business name both save with non-empty, different slugs", async () => {
    const a = await saveAs("blankA", "");
    const b = await saveAs("blankB", null);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const slugA = rows.get("blankA")?.slug as string;
    const slugB = rows.get("blankB")?.slug as string;
    expect(slugA.length).toBeGreaterThan(0);
    expect(slugB.length).toBeGreaterThan(0);
    expect(slugB).not.toBe(slugA);
  });

  it("an owner re-saving keeps their existing slug, even after renaming the business", async () => {
    await saveAs("ownerA", "Acme Restoration");
    await saveAs("ownerB", "Acme Restoration");
    const before = rows.get("ownerB")?.slug;

    expect((await saveAs("ownerB", "Acme Restoration")).status).toBe(200);
    expect(rows.get("ownerB")?.slug).toBe(before);

    expect((await saveAs("ownerB", "Brand New Name")).status).toBe(200);
    expect(rows.get("ownerB")?.slug).toBe(before);
    expect(rows.size).toBe(2);
  });
});
