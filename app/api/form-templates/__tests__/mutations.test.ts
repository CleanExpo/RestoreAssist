/**
 * RA-7957 — form templates could not be created or deleted: both create
 * screens POST /api/form-templates and the list DELETEs /api/form-templates/[id],
 * but those routes exported only GET (and GET/PATCH), so Next.js answered 405.
 *
 * Contract locked here:
 *   - only ADMIN or MANAGER may create, change or archive a template, and the
 *     role is re-read from the database, not the session;
 *   - a template is always owned by the caller: the body cannot name an owner,
 *     a workspace or system status, and another user's template is 404;
 *   - DELETE archives (isActive false, status ARCHIVED); it never hard-deletes,
 *     so submissions, interview sessions and versions keep their history.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as collection from "../route";
import * as item from "../[id]/route";

const h = vi.hoisted(() => ({
  session: vi.fn(),
  userFindUnique: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  hardDelete: vi.fn(),
  deleteMany: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: h.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: h.userFindUnique },
    formTemplate: {
      create: h.create,
      updateMany: h.updateMany,
      update: h.update,
      findMany: h.findMany,
      findFirst: h.findFirst,
      delete: h.hardDelete,
      deleteMany: h.deleteMany,
    },
  },
}));

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
const valid = { name: " Donga room check ", formType: "CUSTOM", category: "QUALITY_CONTROL" };

function signIn(userId: string, sessionRole: Role, dbRole: Role | null) {
  h.session.mockResolvedValue({ user: { id: userId, role: sessionRole } });
  h.userFindUnique.mockResolvedValue(dbRole === null ? null : { role: dbRole });
}

function postRequest(body: unknown, raw = false) {
  return new NextRequest("http://localhost/api/form-templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  });
}
async function post(body: unknown, raw = false) {
  expect(typeof (collection as Record<string, unknown>).POST, "POST must be exported for both create screens").toBe("function");
  return (collection as any).POST(postRequest(body, raw)) as Promise<Response>;
}
async function archive(id: string) {
  expect(typeof (item as Record<string, unknown>).DELETE, "DELETE must be exported for the list screen").toBe("function");
  return (item as any).DELETE(
    new NextRequest(`http://localhost/api/form-templates/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  ) as Promise<Response>;
}
async function patch(id: string, body: unknown) {
  return item.PATCH(
    new NextRequest(`http://localhost/api/form-templates/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function matches(row: Row, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => row[key as keyof Row] === value);
}

beforeEach(() => {
  vi.resetAllMocks();
  signIn("owner-a", "ADMIN", "ADMIN");
  h.create.mockImplementation(async ({ data }) => ({ ...data, id: "new-template" }));
  rows = [
    { id: "owned", userId: "owner-a", isSystemTemplate: false, isActive: true, status: "PUBLISHED", name: "Mine" },
    { id: "foreign", userId: "owner-b", isSystemTemplate: false, isActive: true, status: "PUBLISHED", name: "Theirs" },
    { id: "system", userId: "owner-a", isSystemTemplate: true, isActive: true, status: "PUBLISHED", name: "System" },
    { id: "inactive", userId: "owner-a", isSystemTemplate: false, isActive: false, status: "ARCHIVED", name: "Old" },
  ];
  h.updateMany.mockImplementation(async ({ where, data }) => {
    const selected = rows.filter((row) => matches(row, where));
    selected.forEach((row) => Object.assign(row, data));
    return { count: selected.length };
  });
  h.findFirst.mockImplementation(async ({ where }) => rows.find((row) => matches(row, where)) ?? null);
  h.update.mockImplementation(async ({ where, data }) => {
    const row = rows.find((r) => matches(r, where));
    if (!row) throw new Error("Record to update not found");
    Object.assign(row, data);
    return row;
  });
});

describe("RA-7957 POST /api/form-templates — create", () => {
  it("requires a session and writes nothing without one", async () => {
    h.session.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
  });

  it.each<Role>(["ADMIN", "MANAGER"])("creates a template owned by the caller for a %s and returns 201 { template }", async (role) => {
    signIn("owner-a", role, role);
    const response = await post({
      ...valid,
      description: "Room cleaned, moisture spot check, possible mould with photo",
      requiresSignatures: true,
      formSchema: JSON.stringify({ sections: [], fields: [] }),
      status: "DRAFT",
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.template).toMatchObject({ id: "new-template", name: "Donga room check" });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].data).toMatchObject({
      userId: "owner-a",
      createdBy: "owner-a",
      isSystemTemplate: false,
      isActive: true,
      formType: "CUSTOM",
      category: "QUALITY_CONTROL",
      status: "DRAFT",
      requiresSignatures: true,
    });
    expect(h.userFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "owner-a" } }));
  });

  it("accepts the inline screen's payload (no formSchema) with server defaults", async () => {
    const response = await post({ name: "Site induction", formType: "SITE_INDUCTION", category: "CUSTOM" });
    expect(response.status).toBe(201);
    expect(h.create.mock.calls[0][0].data).toMatchObject({
      description: null,
      status: "DRAFT",
      requiresSignatures: false,
      formSchema: JSON.stringify({ sections: [], fields: [] }),
    });
  });

  it("refuses a USER (technician) with 403 and writes nothing", async () => {
    signIn("tech-a", "USER", "USER");
    const response = await post(valid);
    expect(response.status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("trusts the database role, not the session: stale ADMIN session demoted to USER gets 403", async () => {
    signIn("demoted", "ADMIN", "USER");
    expect((await post(valid)).status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("refuses a session whose user no longer exists", async () => {
    signIn("ghost", "ADMIN", null);
    expect((await post(valid)).status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
  });

  it.each([
    { userId: "owner-b" },
    { createdBy: "owner-b" },
    { workspaceId: "workspace-of-business-b" },
    { isSystemTemplate: true },
    { isActive: false },
  ])("refuses a body that tries to choose ownership or tenancy %j (cross-tenant create)", async (extra) => {
    const response = await post({ ...valid, ...extra });
    expect(response.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("never lets an ADMIN create on behalf of another business", async () => {
    signIn("admin-b", "ADMIN", "ADMIN");
    await post(valid);
    expect(h.create.mock.calls[0][0].data.userId).toBe("admin-b");
    expect(h.create.mock.calls[0][0].data.createdBy).toBe("admin-b");
  });

  it.each([
    null,
    [],
    {},
    { ...valid, name: "   " },
    { ...valid, name: 42 },
    { ...valid, name: "x".repeat(201) },
    { ...valid, formType: "INITIAL_ASSESSMENT" },
    { ...valid, formType: undefined },
    { ...valid, category: "OTHER" },
    { ...valid, requiresSignatures: "true" },
    { ...valid, formSchema: "not json" },
    { ...valid, formSchema: "[]" },
    { ...valid, status: "ARCHIVED" },
  ].map((payload) => [payload]))("rejects invalid input %j with 400 and writes nothing", async (payload) => {
    const response = await post(payload);
    expect(response.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    expect((await post("{", true)).status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe("RA-7957 DELETE /api/form-templates/[id] — archive", () => {
  it("requires a session", async () => {
    h.session.mockResolvedValue(null);
    expect((await archive("owned")).status).toBe(401);
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it.each<Role>(["ADMIN", "MANAGER"])("archives the caller's own template for a %s, never hard-deleting", async (role) => {
    signIn("owner-a", role, role);
    const response = await archive("owned");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, archived: true });
    expect(h.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "owned", userId: "owner-a", isSystemTemplate: false, isActive: true },
      data: { isActive: false, status: "ARCHIVED" },
    });
    expect(rows.find((r) => r.id === "owned")).toMatchObject({ isActive: false, status: "ARCHIVED" });
    expect(h.hardDelete).not.toHaveBeenCalled();
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses a USER with 403 and changes nothing", async () => {
    signIn("owner-a", "USER", "USER");
    const before = structuredClone(rows);
    expect((await archive("owned")).status).toBe(403);
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(rows).toEqual(before);
  });

  it.each(["foreign", "system", "inactive", "missing"])("returns 404 for %s and changes nothing", async (id) => {
    const before = structuredClone(rows);
    expect((await archive(id)).status).toBe(404);
    expect(rows).toEqual(before);
    expect(h.hardDelete).not.toHaveBeenCalled();
  });

  it("an ADMIN of another business cannot archive this business's template (cross-tenant)", async () => {
    signIn("admin-b", "ADMIN", "ADMIN");
    expect((await archive("owned")).status).toBe(404);
    expect(rows.find((r) => r.id === "owned")?.isActive).toBe(true);
    expect(h.updateMany.mock.calls[0][0].where.userId).toBe("admin-b");
  });
});

describe("RA-7957 PATCH /api/form-templates/[id] — same gate", () => {
  it("lets an ADMIN rename their own template", async () => {
    h.update.mockImplementation(async ({ data }) => ({ id: "owned", ...data }));
    const response = await patch("owned", { name: "Block C room check" });
    expect(response.status).toBe(200);
  });

  it("refuses a USER with 403 before reading or writing", async () => {
    signIn("owner-a", "USER", "USER");
    expect((await patch("owned", { name: "Renamed" })).status).toBe(403);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("an ADMIN of another business gets 404 and nothing changes (cross-tenant)", async () => {
    signIn("admin-b", "ADMIN", "ADMIN");
    expect((await patch("owned", { name: "Hijacked" })).status).toBe(404);
    expect(rows.find((r) => r.id === "owned")?.name).toBe("Mine");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("rejects a formType outside the schema enum with 400", async () => {
    expect((await patch("owned", { formType: "INITIAL_ASSESSMENT" })).status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});
