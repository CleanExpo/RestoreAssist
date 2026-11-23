// RA-8384: the server must not turn dates into text. It has no idea which
// country or time zone the reader is in, so `toLocaleDateString()` with no
// arguments printed US-style dates (11/2/2026 for 3 November) on a US-default
// server. The routes send the ISO moment; the screens format it.
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

// 08:00 Brisbane on 3 Nov 2026 is 22:00 UTC on 2 Nov.
const LAST_REPORT = new Date("2026-11-02T22:00:00.000Z");

beforeEach(() => {
  seed({
    user: USERS,
    client: [
      { id: "with-job", userId: "admin-a", name: "with-job", workspaceId: null, createdAt: LAST_REPORT },
      { id: "no-job", userId: "admin-a", name: "no-job", workspaceId: null, createdAt: LAST_REPORT },
    ],
    report: [
      {
        id: "r1",
        userId: "admin-a",
        clientId: "with-job",
        totalCost: 1,
        status: "COMPLETED",
        workspaceId: null,
        createdAt: LAST_REPORT,
        updatedAt: LAST_REPORT,
        title: "r1",
      },
    ],
    invoice: [],
  });
  session.current = sessionFor("admin-a");
});

describe("client routes send dates as ISO, never as locale text (RA-8384)", () => {
  it("GET /api/clients sends lastReportAt and no lastJob text", async () => {
    const res = await listClients(new Request("http://localhost/api/clients?limit=100") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = Object.fromEntries(
      body.clients.map((c: { id: string }) => [c.id, c]),
    ) as Record<string, Record<string, unknown>>;
    expect(byId["with-job"]).not.toHaveProperty("lastJob");
    expect(byId["with-job"].lastReportAt).toBe(LAST_REPORT.toISOString());
    expect(byId["no-job"]).not.toHaveProperty("lastJob");
    expect(byId["no-job"].lastReportAt).toBeNull();
  });

  it("GET /api/clients/[id] sends lastReportAt and no lastJob text", async () => {
    const withJob = await getClient(new Request("http://localhost/api/clients/with-job") as never, {
      params: Promise.resolve({ id: "with-job" }),
    });
    expect(withJob.status).toBe(200);
    const a = await withJob.json();
    expect(a).not.toHaveProperty("lastJob");
    expect(a.lastReportAt).toBe(LAST_REPORT.toISOString());

    const noJob = await getClient(new Request("http://localhost/api/clients/no-job") as never, {
      params: Promise.resolve({ id: "no-job" }),
    });
    const b = await noJob.json();
    expect(b).not.toHaveProperty("lastJob");
    expect(b.lastReportAt).toBeNull();
  });
});
