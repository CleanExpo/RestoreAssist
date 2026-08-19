import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const integrationFindFirst = vi.fn();
const externalJobFindMany = vi.fn();
const externalJobCount = vi.fn();
const externalClientFindMany = vi.fn();
const ascoraIntegrationFindUnique = vi.fn();
const historicalJobFindMany = vi.fn();
const historicalJobCount = vi.fn();
const ascoraJobFindMany = vi.fn();
const ascoraJobCount = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: {
      findFirst: (...args: unknown[]) => integrationFindFirst(...args),
    },
    externalJob: {
      findMany: (...args: unknown[]) => externalJobFindMany(...args),
      count: (...args: unknown[]) => externalJobCount(...args),
    },
    externalClient: {
      findMany: (...args: unknown[]) => externalClientFindMany(...args),
    },
    ascoraIntegration: {
      findUnique: (...args: unknown[]) => ascoraIntegrationFindUnique(...args),
    },
    historicalJob: {
      findMany: (...args: unknown[]) => historicalJobFindMany(...args),
      count: (...args: unknown[]) => historicalJobCount(...args),
    },
    ascoraJob: {
      findMany: (...args: unknown[]) => ascoraJobFindMany(...args),
      count: (...args: unknown[]) => ascoraJobCount(...args),
    },
  },
}));

import { GET } from "../route";

function getRequest(query: string) {
  return new NextRequest(`http://localhost/api/synced/jobs?${query}`);
}

beforeEach(() => {
  getServerSession.mockReset();
  integrationFindFirst.mockReset();
  externalJobFindMany.mockReset();
  externalJobCount.mockReset();
  externalClientFindMany.mockReset();
  ascoraIntegrationFindUnique.mockReset();
  historicalJobFindMany.mockReset();
  historicalJobCount.mockReset();
  ascoraJobFindMany.mockReset();
  ascoraJobCount.mockReset();
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
});

describe("GET /api/synced/jobs", () => {
  it("rejects invalid source", async () => {
    const res = await GET(getRequest("source=native"));
    expect(res.status).toBe(400);
  });

  it("lists Xero ExternalJob rows with resolved client names", async () => {
    integrationFindFirst.mockResolvedValue({ id: "int_1" });
    externalJobFindMany.mockResolvedValue([
      {
        id: "ej_1",
        externalId: "inv-1",
        title: "INV-100",
        status: "PAID",
        clientExternalId: "c-1",
        address: null,
        description: "Water claim",
        claimId: null,
        lastSyncedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    externalJobCount.mockResolvedValue(1);
    externalClientFindMany.mockResolvedValue([
      { externalId: "c-1", name: "Acme Pty" },
    ]);

    const res = await GET(getRequest("source=xero"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.items[0]).toMatchObject({
      title: "INV-100",
      clientName: "Acme Pty",
      canImport: true,
      source: "xero",
    });
  });

  it("lists Ascora HistoricalJob rows", async () => {
    ascoraIntegrationFindUnique.mockResolvedValue({ id: "asc_1" });
    historicalJobCount.mockResolvedValue(1);
    historicalJobFindMany.mockResolvedValue([
      {
        id: "hj_1",
        externalId: "job-99",
        jobName: "FEN - Smith - Logan",
        jobNumber: "J-99",
        customerName: "Smith",
        address: "1 River Rd",
        suburb: "Logan",
        state: "QLD",
        postcode: "4114",
        description: "Water damage",
        claimType: "water",
        totalExTax: 12000,
        completedDate: new Date("2026-02-01"),
        updatedAt: new Date("2026-02-02"),
      },
    ]);

    const res = await GET(getRequest("source=ascora"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items[0]).toMatchObject({
      title: "FEN - Smith - Logan",
      clientName: "Smith",
      claimType: "water",
      totalExTax: 12000,
      status: "COMPLETED",
      canImport: false,
      source: "ascora",
    });
  });

  it("falls back to AscoraJob when HistoricalJob is empty", async () => {
    ascoraIntegrationFindUnique.mockResolvedValue({ id: "asc_1" });
    historicalJobCount.mockResolvedValue(0);
    historicalJobFindMany.mockResolvedValue([]);
    ascoraJobCount.mockResolvedValue(1);
    ascoraJobFindMany.mockResolvedValue([
      {
        id: "aj_1",
        ascoraJobId: "ascora-job-1",
        ascoraJobNumber: "A-1",
        jobType: "Water Restoration",
        claimType: "water",
        suburb: "Brisbane",
        state: "QLD",
        postcode: "4000",
        completedAt: null,
        totalExTax: 5000,
        importedAt: new Date("2026-01-01"),
      },
    ]);

    const res = await GET(getRequest("source=ascora"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      title: "A-1",
      claimType: "water",
      source: "ascora",
    });
  });
});
