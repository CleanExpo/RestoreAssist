/**
 * RA-8535: the customer record.
 *
 * 1. The detail and timeline routes take the same reach as the list (D-023):
 *    whoever sees a client in the list can open it, and nobody else can.
 * 2. Duplicate gives the copy its own email; copying the original's email was
 *    refused by the (userId, email) unique index every time.
 * 3. Create-time email matching ignores case.
 *
 * The fake database evaluates the real `where` each route builds, so dropping
 * or widening a tenancy clause changes the answer and fails a test here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const session = vi.hoisted(() => ({ current: null as null | object }));
const created = vi.hoisted(() => ({ rows: [] as Record<string, any>[] }));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => session.current),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/get-api-session", () => ({
  getApiSession: vi.fn(async () => session.current),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/zoho/queue", () => ({
  scheduleZohoCustomerPush: vi.fn(),
}));
vi.mock("@/lib/prisma", async () => {
  const { fakePrisma } = await import("@/lib/auth/__tests__/helpers/fake-tenant-db");
  return {
    prisma: {
      ...fakePrisma,
      client: {
        ...fakePrisma.client,
        // Enforces the real @@unique([userId, email]), which is case-sensitive.
        create: vi.fn(async ({ data }: { data: Record<string, any> }) => {
          const existing = await fakePrisma.client.findMany({
            where: { userId: data.userId },
          });
          if (
            [...existing, ...created.rows].some(
              (r) => r.userId === data.userId && r.email === data.email,
            )
          ) {
            throw Object.assign(new Error("Unique constraint failed on (userId, email)"), {
              code: "P2002",
            });
          }
          const row = { id: `new-${created.rows.length + 1}`, ...data, _count: { reports: 0 } };
          created.rows.push(row);
          return row;
        }),
      },
      clientCommsLog: { findMany: vi.fn(async () => []) },
    },
  };
});

import { GET as listClients, POST as createClient } from "../route";
import { GET as getClient } from "../[id]/route";
import { GET as getTimeline } from "../[id]/timeline/route";
import { POST as duplicateClient } from "../[id]/duplicate/route";
import { USERS, seed, sessionFor } from "@/lib/auth/__tests__/helpers/fake-tenant-db";

const WHEN = new Date(2026, 9, 1);

function client(id: string, userId: string, email = `${id}@example.test`) {
  return {
    id,
    userId,
    name: id,
    email,
    phone: "0400 000 000",
    address: "1 Harbour St",
    company: null,
    contactPerson: null,
    notes: null,
    status: "ACTIVE",
    workspaceId: null,
    createdAt: WHEN,
  };
}
function inspection(id: string, userId: string, clientId: string) {
  return {
    id,
    userId,
    clientId,
    workspaceId: null,
    inspectionNumber: id,
    propertyAddress: "1 Harbour St",
    claimType: "WATER",
    createdAt: WHEN,
    completedAt: null,
  };
}

const CLIENTS = ["owner-client", "manager-client", "tech-client", "b-client"];

beforeEach(() => {
  created.rows.length = 0;
  seed({
    user: USERS,
    client: [
      client("owner-client", "admin-a", "Office@Harbour.example"),
      client("manager-client", "manager-a"),
      client("tech-client", "tech-a"),
      client("b-client", "admin-b"),
    ],
    report: [],
    invoice: [],
    inspection: [
      inspection("job-a", "admin-a", "owner-client"),
      inspection("job-b", "admin-b", "owner-client"),
    ],
  });
});

async function listedBy(userId: string): Promise<string[]> {
  session.current = sessionFor(userId);
  const res = await listClients(new NextRequest("http://localhost/api/clients?limit=100"));
  expect(res.status).toBe(200);
  return (await res.json()).clients.map((c: { id: string }) => c.id);
}
async function openAs(userId: string, id: string) {
  session.current = sessionFor(userId);
  return getClient(new NextRequest(`http://localhost/api/clients/${id}`), {
    params: Promise.resolve({ id }),
  });
}
async function timelineAs(userId: string, id: string) {
  session.current = sessionFor(userId);
  return getTimeline(new NextRequest(`http://localhost/api/clients/${id}/timeline`), {
    params: Promise.resolve({ id }),
  });
}
async function duplicateAs(userId: string, id: string, body?: unknown) {
  session.current = sessionFor(userId);
  return duplicateClient(
    new NextRequest(`http://localhost/api/clients/${id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id }) },
  );
}
async function createAs(userId: string, body: Record<string, unknown>) {
  session.current = sessionFor(userId);
  return createClient(
    new NextRequest("http://localhost/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET /api/clients/[id] takes the list's reach (RA-8535)", () => {
  it("lets a manager open a colleague's client they can see in the list", async () => {
    expect(await listedBy("manager-a")).toContain("owner-client");
    const res = await openAs("manager-a", "owner-client");
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("owner-client");
  });

  it("still gives another organisation 404", async () => {
    expect(await listedBy("admin-b")).not.toContain("owner-client");
    expect((await openAs("admin-b", "owner-client")).status).toBe(404);
  });

  it("does not widen a technician past the list: a colleague's client stays 404", async () => {
    expect(await listedBy("tech-a")).toEqual(["tech-client"]);
    expect((await openAs("tech-a", "owner-client")).status).toBe(404);
    expect((await openAs("tech-a", "tech-client")).status).toBe(200);
  });

  it("opens exactly the clients the list shows, for every user", async () => {
    for (const user of USERS.map((u) => u.id as string)) {
      const listed = await listedBy(user);
      for (const id of CLIENTS) {
        const status = (await openAs(user, id)).status;
        expect({ user, id, status }).toEqual({
          user,
          id,
          status: listed.includes(id) ? 200 : 404,
        });
      }
    }
  });
});

describe("GET /api/clients/[id]/timeline takes the list's reach (RA-8535)", () => {
  it("lets a manager open a colleague's client timeline, showing only jobs they can reach", async () => {
    const res = await timelineAs("manager-a", "owner-client");
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("job-a");
    expect(text).not.toContain("job-b");
  });

  it("still gives another organisation 404", async () => {
    expect((await timelineAs("admin-b", "manager-client")).status).toBe(404);
  });
});

describe("POST /api/clients/[id]/duplicate (RA-8535)", () => {
  it("creates the copy under the new email it is given", async () => {
    const res = await duplicateAs("admin-a", "owner-client", { email: "accounts@harbour.example" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("accounts@harbour.example");
    expect(body.name).toBe("owner-client (Copy)");
    expect(body.userId).toBe("admin-a");
  });

  it("asks for an email instead of failing on the unique index", async () => {
    const res = await duplicateAs("admin-a", "owner-client");
    expect(res.status).toBe(400);
    expect(created.rows).toHaveLength(0);
  });

  it("refuses an email the caller already uses, in any capitalisation", async () => {
    const res = await duplicateAs("admin-a", "owner-client", { email: "office@harbour.example" });
    expect(res.status).toBe(409);
    expect(created.rows).toHaveLength(0);
  });

  it("is 404 for a client outside the list's reach", async () => {
    const res = await duplicateAs("admin-b", "owner-client", { email: "new@b.example" });
    expect(res.status).toBe(404);
    expect(created.rows).toHaveLength(0);
  });
});

describe("POST /api/clients matches email without case (RA-8535)", () => {
  it("refuses the same person under a different capitalisation", async () => {
    const res = await createAs("admin-a", { name: "Harbour", email: "office@harbour.example" });
    expect(res.status).toBe(400);
    expect(created.rows).toHaveLength(0);
  });

  it("stores a new email exactly as typed", async () => {
    const res = await createAs("admin-a", { name: "New", email: "New.Person@Example.test" });
    expect(res.status).toBe(200);
    expect(created.rows[0].email).toBe("New.Person@Example.test");
  });
});
