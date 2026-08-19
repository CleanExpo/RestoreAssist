import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const integrationFindFirst = vi.fn();
const externalClientFindMany = vi.fn();
const externalClientCount = vi.fn();
const ascoraIntegrationFindUnique = vi.fn();
const historicalJobFindMany = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
    },
    externalClient: {
      findMany: (...args: unknown[]) => externalClientFindMany(...args),
      count: (...args: unknown[]) => externalClientCount(...args),
    },
    ascoraIntegration: {
      findUnique: (...args: unknown[]) => ascoraIntegrationFindUnique(...args),
    },
    historicalJob: {
      findMany: (...args: unknown[]) => historicalJobFindMany(...args),
    },
  },
}));

import { GET } from "../route";

function getRequest(query: string) {
  return new NextRequest(`http://localhost/api/synced/clients?${query}`);
}

beforeEach(() => {
  getServerSession.mockReset();
  integrationFindFirst.mockReset();
  externalClientFindMany.mockReset();
  externalClientCount.mockReset();
  ascoraIntegrationFindUnique.mockReset();
  historicalJobFindMany.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("GET /api/synced/clients", () => {
  it("rejects missing/invalid source", async () => {
    const res = await GET(getRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(getRequest("source=xero"));
    expect(res.status).toBe(401);
  });

  it("lists Xero ExternalClient rows when connected", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int_1" });
    externalClientFindMany.mockResolvedValue([
      {
        id: "ec_1",
        externalId: "xero-c-1",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "0400",
        address: "1 St",
        contactId: null,
        lastSyncedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    externalClientCount.mockResolvedValue(1);

    const res = await GET(getRequest("source=xero"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.source).toBe("xero");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      name: "Jane Doe",
      externalId: "xero-c-1",
      canImport: true,
      source: "xero",
    });
    expect(body.pagination).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("honors page + pageSize and returns pagination totals", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int_1" });
    externalClientFindMany.mockResolvedValue([
      {
        id: "ec_2",
        externalId: "xero-c-2",
        name: "Page Two",
        email: null,
        phone: null,
        address: null,
        contactId: null,
        lastSyncedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    externalClientCount.mockResolvedValue(25);

    const res = await GET(getRequest("source=xero&page=2&pageSize=10"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(externalClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    );
    expect(body.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
    });
    expect(body.items).toHaveLength(1);
  });

  it("accepts legacy limit query param as pageSize alias", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int_1" });
    externalClientFindMany.mockResolvedValue([]);
    externalClientCount.mockResolvedValue(0);

    const res = await GET(getRequest("source=xero&page=1&limit=15"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(externalClientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 15, skip: 0 }),
    );
    expect(body.pagination.pageSize).toBe(15);
  });

  it("returns connected=false when Xero integration missing", async () => {
    integrationFindFirst.mockResolvedValue(null);
    const res = await GET(getRequest("source=xero"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.connected).toBe(false);
    expect(body.items).toEqual([]);
  });

  it("derives Ascora clients from HistoricalJob.customerName", async () => {
    ascoraIntegrationFindUnique.mockResolvedValue({
      id: "asc_1",
      isActive: true,
    });
    historicalJobFindMany.mockResolvedValue([
      {
        id: "hj_1",
        externalId: "job-1",
        customerName: "Jane Homeowner",
        address: "10 Main",
        suburb: "Brisbane",
        state: "QLD",
        postcode: "4000",
        completedDate: new Date("2026-01-02"),
        updatedAt: new Date("2026-01-03"),
      },
      {
        id: "hj_2",
        externalId: "job-2",
        customerName: "Jane Homeowner",
        address: "10 Main",
        suburb: "Brisbane",
        state: "QLD",
        postcode: "4000",
        completedDate: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      },
      {
        id: "hj_3",
        externalId: "job-3",
        customerName: "Suncorp",
        address: null,
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        completedDate: null,
        updatedAt: new Date("2026-01-01"),
      },
    ]);

    const res = await GET(getRequest("source=ascora"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i: { name: string }) => i.name).sort()).toEqual([
      "Jane Homeowner",
      "Suncorp",
    ]);
    const jane = body.items.find(
      (i: { name: string }) => i.name === "Jane Homeowner",
    );
    expect(jane.jobCount).toBe(2);
    expect(jane.canImport).toBe(false);
  });
});
