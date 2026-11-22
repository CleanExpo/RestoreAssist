/**
 * RA-8543 — follow-ups from RA-7957.
 *
 *   1. POST /api/form-templates replays on a repeated Idempotency-Key, so a
 *      double submit or a retry after a lost reply makes one template, not two.
 *   2. PATCH /api/form-templates/[id] honours { isActive } (the list's Active
 *      switch) for an owner or manager, and can find an inactive template so it
 *      can be switched back on. A technician gets 403.
 *   3. Seeding default templates (GET auto-seed when empty, POST /seed) is for
 *      owners and managers only. A technician's GET still lists, never seeds.
 *
 * The idempotency store is a real in-memory stand-in for prisma.idempotencyRecord;
 * lib/idempotency itself is not mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type IdemRecord = Record<string, any>;
const h = vi.hoisted(() => ({
  session: vi.fn(),
  userFindUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  idem: new Map<string, Record<string, any>>(),
  idemNext: 0,
}));
vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: h.userFindUnique },
    formTemplate: {
      create: h.create,
      update: h.update,
      updateMany: h.updateMany,
      findMany: h.findMany,
      findFirst: h.findFirst,
    },
    idempotencyRecord: {
      create: vi.fn(async ({ data }: { data: IdemRecord }) => {
        if (h.idem.has(data.cacheKey)) throw { code: "P2002" };
        const id = `reservation-${++h.idemNext}`;
        h.idem.set(data.cacheKey, {
          ...data,
          id,
          responseStatus: null,
          responseBody: null,
          responseContentType: null,
        });
        return { id };
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { cacheKey: string } }) => h.idem.get(where.cacheKey) ?? null,
      ),
      updateMany: vi.fn(async ({ where, data }: { where: IdemRecord; data: IdemRecord }) => {
        const record = h.idem.get(where.cacheKey);
        if (
          !record ||
          (where.id && record.id !== where.id) ||
          (where.status && record.status !== where.status) ||
          (where.fingerprint && record.fingerprint !== where.fingerprint)
        )
          return { count: 0 };
        h.idem.set(where.cacheKey, { ...record, ...data });
        return { count: 1 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: IdemRecord }) => {
        let count = 0;
        for (const [key, record] of h.idem) {
          if (where.cacheKey && key !== where.cacheKey) continue;
          if (where.id && record.id !== where.id) continue;
          if (where.status && record.status !== where.status) continue;
          if (where.expiresAt && record.expiresAt >= where.expiresAt.lt) continue;
          h.idem.delete(key);
          count++;
        }
        return { count };
      }),
    },
  },
}));

import * as collection from "../route";
import * as item from "../[id]/route";
import * as seed from "../seed/route";

type Role = "ADMIN" | "MANAGER" | "USER";
type Row = {
  id: string;
  userId: string;
  isSystemTemplate: boolean;
  isActive: boolean;
  status: string;
  name: string;
};
let rows: Row[];
let createdCount: number;

function signIn(userId: string, role: Role) {
  h.session.mockResolvedValue({ user: { id: userId, role } });
  h.userFindUnique.mockResolvedValue({ role });
}

function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, unknown>[]).some((w) => matches(row, w));
    return row[key as keyof Row] === value;
  });
}

const valid = { name: "Donga room check", formType: "CUSTOM", category: "QUALITY_CONTROL" };

function post(body: unknown, key?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["Idempotency-Key"] = key;
  return (collection as any).POST(
    new NextRequest("http://localhost/api/form-templates", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  ) as Promise<Response>;
}
function patch(id: string, body: unknown) {
  return item.PATCH(
    new NextRequest(`http://localhost/api/form-templates/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ) as Promise<Response>;
}
function list() {
  return collection.GET(new NextRequest("http://localhost/api/form-templates")) as Promise<Response>;
}
function seedPost() {
  return seed.POST(
    new NextRequest("http://localhost/api/form-templates/seed", { method: "POST" }),
  ) as Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.idem.clear();
  createdCount = 0;
  signIn("owner-a", "ADMIN");
  rows = [
    { id: "owned", userId: "owner-a", isSystemTemplate: false, isActive: true, status: "PUBLISHED", name: "Mine" },
    { id: "foreign", userId: "owner-b", isSystemTemplate: false, isActive: true, status: "PUBLISHED", name: "Theirs" },
    { id: "system", userId: "owner-a", isSystemTemplate: true, isActive: true, status: "PUBLISHED", name: "System" },
    { id: "archived", userId: "owner-a", isSystemTemplate: false, isActive: false, status: "ARCHIVED", name: "Old" },
  ];
  h.create.mockImplementation(async ({ data }) => {
    const row = { ...data, id: `new-${++createdCount}` };
    rows.push(row);
    return row;
  });
  h.findFirst.mockImplementation(async ({ where }) => rows.find((row) => matches(row, where)) ?? null);
  h.findMany.mockImplementation(async ({ where }) => rows.filter((row) => matches(row, where)));
  h.update.mockImplementation(async ({ where, data }) => {
    const row = rows.find((r) => matches(r, where));
    if (!row) throw new Error("Record to update not found");
    Object.assign(row, data);
    return { ...row };
  });
  h.updateMany.mockImplementation(async ({ where, data }) => {
    const selected = rows.filter((row) => matches(row, where));
    selected.forEach((row) => Object.assign(row, data));
    return { count: selected.length };
  });
});

describe("RA-8543 item 1 — POST /api/form-templates is idempotent", () => {
  it("two POSTs with the same Idempotency-Key create one template and replay the first reply", async () => {
    const first = await post(valid, "create-attempt-0001");
    expect(first.status).toBe(201);
    const second = await post(valid, "create-attempt-0001");
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(h.create).toHaveBeenCalledTimes(1);
    expect((await second.json()).template.id).toBe((await first.json()).template.id);
  });

  it("a different key is a new create", async () => {
    await post(valid, "create-attempt-0001");
    await post(valid, "create-attempt-0002");
    expect(h.create).toHaveBeenCalledTimes(2);
  });

  it("the same key with a different body is refused with 409 and creates nothing more", async () => {
    await post(valid, "create-attempt-0001");
    const reused = await post({ ...valid, name: "Another" }, "create-attempt-0001");
    expect(reused.status).toBe(409);
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("a technician is still refused with 403 before any key is reserved", async () => {
    signIn("tech-a", "USER");
    expect((await post(valid, "create-attempt-0001")).status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.idem.size).toBe(0);
  });
});

describe("RA-8543 item 2 — PATCH honours isActive", () => {
  it.each<Role>(["ADMIN", "MANAGER"])("a %s can deactivate then reactivate a template (round trip)", async (role) => {
    signIn("owner-a", role);
    const off = await patch("owned", { isActive: false });
    expect(off.status).toBe(200);
    expect((await off.json()).template.isActive).toBe(false);
    expect(rows.find((r) => r.id === "owned")?.isActive).toBe(false);

    const on = await patch("owned", { isActive: true });
    expect(on.status).toBe(200);
    expect((await on.json()).template.isActive).toBe(true);
    expect(rows.find((r) => r.id === "owned")).toMatchObject({ isActive: true, status: "PUBLISHED" });
  });

  it("reactivating an archived template brings it back as a draft, not as archived", async () => {
    const on = await patch("archived", { isActive: true });
    expect(on.status).toBe(200);
    expect(rows.find((r) => r.id === "archived")).toMatchObject({ isActive: true, status: "DRAFT" });
  });

  it("a technician gets 403 and nothing changes", async () => {
    signIn("owner-a", "USER");
    expect((await patch("owned", { isActive: false })).status).toBe(403);
    expect((await patch("archived", { isActive: true })).status).toBe(403);
    expect(rows.find((r) => r.id === "owned")?.isActive).toBe(true);
    expect(rows.find((r) => r.id === "archived")?.isActive).toBe(false);
  });

  it("an inactive template cannot be renamed while it stays inactive", async () => {
    expect((await patch("archived", { name: "Renamed" })).status).toBe(404);
    expect(rows.find((r) => r.id === "archived")?.name).toBe("Old");
  });

  it("another business's template is 404 and stays as it was (cross-tenant)", async () => {
    signIn("admin-b", "ADMIN");
    expect((await patch("owned", { isActive: false })).status).toBe(404);
    expect(rows.find((r) => r.id === "owned")?.isActive).toBe(true);
  });

  it("a system template cannot be switched off", async () => {
    expect((await patch("system", { isActive: false })).status).toBe(404);
    expect(rows.find((r) => r.id === "system")?.isActive).toBe(true);
  });

  it("rejects a non-boolean isActive with 400", async () => {
    expect((await patch("owned", { isActive: "false" })).status).toBe(400);
    expect(rows.find((r) => r.id === "owned")?.isActive).toBe(true);
  });
});

describe("RA-8543 item 3 — seeding is for owners and managers only", () => {
  beforeEach(() => {
    rows = [];
  });

  it.each<Role>(["ADMIN", "MANAGER"])("GET auto-seeds defaults for an empty %s", async (role) => {
    signIn("owner-a", role);
    const res = await list();
    expect(res.status).toBe(200);
    expect(h.create).toHaveBeenCalled();
    expect((await res.json()).templates.length).toBeGreaterThan(0);
  });

  it("a technician's GET lists (empty) and seeds nothing", async () => {
    signIn("tech-a", "USER");
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ templates: [] });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("a technician's GET still lists the templates they can see", async () => {
    rows = [
      { id: "system", userId: "owner-a", isSystemTemplate: true, isActive: true, status: "PUBLISHED", name: "System" },
    ];
    signIn("tech-a", "USER");
    const res = await list();
    expect((await res.json()).templates.map((t: Row) => t.id)).toEqual(["system"]);
    expect(h.create).not.toHaveBeenCalled();
  });

  it.each<Role>(["ADMIN", "MANAGER"])("POST /seed creates defaults for a %s", async (role) => {
    signIn("owner-a", role);
    const res = await seedPost();
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBeGreaterThan(0);
  });

  it("POST /seed refuses a technician with 403 and creates nothing", async () => {
    signIn("tech-a", "USER");
    const res = await seedPost();
    expect(res.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("POST /seed trusts the database role, not a stale ADMIN session", async () => {
    h.session.mockResolvedValue({ user: { id: "demoted", role: "ADMIN" } });
    h.userFindUnique.mockResolvedValue({ role: "USER" });
    expect((await seedPost()).status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });
});
