import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | object }));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => session.current),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/get-api-session", () => ({
  getApiSession: vi.fn(async () => session.current),
}));
vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("@/lib/auth/__tests__/helpers/fake-tenant-db")).fakePrisma,
}));

import { GET as listClients } from "../route";
import { GET as getClient } from "../[id]/route";
import {
  USERS,
  seed,
  sessionFor,
} from "@/lib/auth/__tests__/helpers/fake-tenant-db";

const WHEN = new Date(2026, 9, 1);

function client(id: string, userId: string) {
  return { id, userId, name: id, workspaceId: null, createdAt: WHEN };
}
function report(id: string, userId: string, clientId: string, totalCost: number, status = "COMPLETED") {
  return { id, userId, clientId, totalCost, status, workspaceId: null, createdAt: WHEN, updatedAt: WHEN, title: id };
}
function invoice(id: string, userId: string, clientId: string | null, status: string, cents: number) {
  return { id, userId, clientId, status, totalIncGST: cents, workspaceId: null, createdAt: WHEN };
}

async function listFor(userId: string) {
  session.current = sessionFor(userId);
  const res = await listClients(new Request("http://localhost/api/clients?limit=100") as never);
  expect(res.status).toBe(200);
  const body = await res.json();
  return Object.fromEntries(
    body.clients.map((c: { id: string }) => [c.id, c]),
  ) as Record<string, any>;
}
async function detailFor(userId: string, id: string) {
  session.current = sessionFor(userId);
  return getClient(new Request(`http://localhost/api/clients/${id}`) as never, {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  seed({
    user: USERS,
    client: [
      client("tech-client", "tech-a"),
      client("owner-client", "admin-a"),
      client("b-client", "admin-b"),
    ],
    report: [
      // The technician owns this client, but the $5000 is the owner's report.
      report("tech-report", "tech-a", "tech-client", 111),
      report("colleague-report", "admin-a", "tech-client", 5000),
      report("draft-report", "admin-a", "owner-client", 999, "DRAFT"),
    ],
    invoice: [
      invoice("i-tech", "tech-a", "tech-client", "PAID", 3000),
      invoice("i-colleague", "admin-a", "tech-client", "SENT", 100000),
      invoice("i-draft", "admin-a", "tech-client", "DRAFT", 500),
      invoice("i-cancelled", "admin-a", "tech-client", "CANCELLED", 700),
      invoice("i-unlinked", "admin-a", null, "PAID", 800),
      invoice("i-b", "admin-b", "b-client", "PAID", 900000),
    ],
  });
});

describe("GET /api/clients revenue (RA-8146)", () => {
  it("adds invoices in dollars, leaving out drafts and cancelled, and reports add nothing", async () => {
    const list = await listFor("admin-a");
    expect(list["tech-client"].totalRevenue).toBe(1030);
    expect(list["owner-client"].totalRevenue).toBe(0);
    expect(list["tech-client"].reportsCount).toBe(2);
  });

  it("shows a technician only their own invoices on a client they own", async () => {
    const list = await listFor("tech-a");
    expect(Object.keys(list)).toEqual(["tech-client"]);
    expect(list["tech-client"].totalRevenue).toBe(30);
  });

  it("keeps another organisation apart", async () => {
    const list = await listFor("admin-b");
    expect(Object.keys(list)).toEqual(["b-client"]);
    expect(list["b-client"].totalRevenue).toBe(9000);
  });

  it("carries no report cost anywhere in the technician's list", async () => {
    const list = await listFor("tech-a");
    const text = JSON.stringify(list);
    expect(text).not.toContain("5000");
    expect(text).not.toContain("5111");
  });
});

describe("GET /api/clients/[id] revenue (RA-8146)", () => {
  it("gives a technician their invoices and no colleague's money, anywhere in the body", async () => {
    const res = await detailFor("tech-a", "tech-client");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRevenue).toBe(30);
    expect(body.invoicedCount).toBe(1);
    const costs = Object.fromEntries(
      body.reports.map((r: { id: string; totalCost: number | null }) => [r.id, r.totalCost]),
    );
    expect(costs).toEqual({ "tech-report": 111, "colleague-report": null });
    const text = JSON.stringify(body);
    expect(text).not.toContain("5000");
    expect(text).not.toContain("1000");
    expect(body.reportsCount).toBe(2);
  });

  it("shows the owner a report's cost, while a draft report adds nothing to revenue", async () => {
    const res = await detailFor("admin-a", "owner-client");
    const body = await res.json();
    expect(body.totalRevenue).toBe(0);
    expect(body.invoicedCount).toBe(0);
    expect(body.reports[0].totalCost).toBe(999);
  });

  it("bounds the report rows it returns", async () => {
    seed({
      user: USERS,
      client: [client("big", "admin-a")],
      report: Array.from({ length: 201 }, (_, i) => report(`r${i}`, "admin-a", "big", 1)),
      invoice: [],
    });
    const body = await (await detailFor("admin-a", "big")).json();
    expect(body.reports).toHaveLength(200);
    expect(body.reportsCount).toBe(201);
  });

  it("does not open another organisation's client", async () => {
    expect((await detailFor("admin-a", "b-client")).status).toBe(404);
  });
});
