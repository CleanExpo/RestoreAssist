/**
 * RA-7026 — CRON_SECRET path env bootstrap on /api/ascora/sync.
 *
 * With zero AscoraIntegration rows the cron path previously 404'd before the
 * route's ASCORA_API_KEY env fallback could run (the fallback needed a
 * session-derived userId, and the session path is gated by the SERVICE_CRM
 * add-on). ASCORA_SYNC_USER_EMAIL names the account a system-level sync
 * attaches to, letting the cron bootstrap the integration record from env
 * alone. All collaborators are mocked so the test runs without a database.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/cron/auth", () => ({ verifyCronAuth: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ requireAddon: vi.fn() }));
vi.mock("@/lib/credential-vault", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  isEncryptedToken: vi.fn((v: string) => v.startsWith("enc:")),
}));
vi.mock("@/lib/integrations/ascora/fetch-with-retry", () => ({
  fetchAscoraWithRetry: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    ascoraIntegration: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ascoraJob: { upsert: vi.fn(), findMany: vi.fn() },
    ascoraLineItem: { create: vi.fn() },
    historicalJob: { upsert: vi.fn() },
    scopePricingDatabase: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { verifyCronAuth } from "@/lib/cron/auth";
import { prisma } from "@/lib/prisma";
import { fetchAscoraWithRetry } from "@/lib/integrations/ascora/fetch-with-retry";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockVerifyCronAuth = verifyCronAuth as unknown as ReturnType<typeof vi.fn>;
const mockFetch = fetchAscoraWithRetry as unknown as ReturnType<typeof vi.fn>;
const p = prisma as unknown as {
  $queryRaw: ReturnType<typeof vi.fn>;
  user: { findUnique: ReturnType<typeof vi.fn> };
  ascoraIntegration: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function makeCronPost(): NextRequest {
  return new NextRequest("http://localhost/api/ascora/sync?incremental=true", {
    method: "POST",
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue(null); // cron path — no session
  mockVerifyCronAuth.mockReturnValue(null); // cron auth passes
  p.$queryRaw.mockResolvedValue([{ tablename: "AscoraIntegration" }]);
  p.ascoraIntegration.findFirst.mockResolvedValue(null); // zero rows
  delete process.env.ASCORA_API_KEY;
  delete process.env.ASCORA_SYNC_USER_EMAIL;
  delete process.env.ASCORA_BASE_URL;
});

describe("RA-7026 — cron-path env bootstrap on /api/ascora/sync", () => {
  it("still 404s with zero integrations and no env config (unchanged behaviour)", async () => {
    const res = await POST(makeCronPost());
    expect(res.status).toBe(404);
  });

  it("404s pointing at ASCORA_SYNC_USER_EMAIL when only the API key is set", async () => {
    process.env.ASCORA_API_KEY = "test-key";

    const res = await POST(makeCronPost());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("ASCORA_SYNC_USER_EMAIL");
  });

  it("404s clearly when ASCORA_SYNC_USER_EMAIL matches no user", async () => {
    process.env.ASCORA_API_KEY = "test-key";
    process.env.ASCORA_SYNC_USER_EMAIL = "nobody@example.com";
    p.user.findUnique.mockResolvedValue(null);

    const res = await POST(makeCronPost());

    expect(res.status).toBe(404);
    expect(p.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "nobody@example.com" },
      }),
    );
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("ASCORA_SYNC_USER_EMAIL");
  });

  it("imports accounting invoice lines and seeds the rate card end-to-end", async () => {
    process.env.ASCORA_API_KEY = "test-key";
    process.env.ASCORA_SYNC_USER_EMAIL = "owner@example.com";
    p.user.findUnique.mockResolvedValue({ id: "u_owner" });
    p.ascoraIntegration.findUnique.mockResolvedValue(null);
    p.ascoraIntegration.create.mockImplementation(async ({ data }: any) => ({
      id: "int_1",
      ...data,
      lastSyncAt: null,
      baseUrl: "https://api.ascora.com.au",
    }));
    p.ascoraIntegration.update.mockResolvedValue({});
    const prismaAll = prisma as any;
    prismaAll.ascoraJob.upsert.mockResolvedValue({});
    prismaAll.ascoraJob.findMany.mockResolvedValue([
      { id: "dbjob_1", ascoraJobId: "aj_1" },
    ]);
    prismaAll.ascoraLineItem.create.mockResolvedValue({});
    prismaAll.historicalJob.upsert.mockResolvedValue({});
    prismaAll.scopePricingDatabase.findUnique.mockResolvedValue(null);
    prismaAll.scopePricingDatabase.create.mockResolvedValue({});
    prismaAll.scopePricingDatabase.upsert.mockResolvedValue({});

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes("/Accounting/GetInvoicesToSend")) {
        return {
          json: async () => [
            {
              id: "inv_1",
              invoiceDate: "2024-01-01T00:00:00",
              jobId: "aj_1",
              invoiceLines: [
                {
                  itemCode: "DEHU-LGR",
                  description: "LGR Dehumidifier hire",
                  quantity: 5,
                  unitAmountExTax: 88,
                  amountExTax: 440,
                  invoiceLineType: "material",
                },
              ],
            },
          ],
        };
      }
      if (url.includes("/Inventory/Supplies")) {
        return {
          json: async () => ({
            success: true,
            totalPages: 1,
            results: [
              {
                supplyId: "s1",
                partNumber: "AFD-500",
                description: "Air filtration device 500",
                unitCostExTax: 40,
                unitSellExTax: 95,
              },
            ],
          }),
        };
      }
      if (url.includes("/jobs")) {
        return {
          json: async () => ({
            success: true,
            totalPages: 1,
            results: [
              {
                jobId: "aj_1",
                jobNumber: "DRQ1",
                jobDescription: "Water damage",
                workUndertaken: "Dried structure",
                totalExTax: 5000,
                completedDate: "2024-01-01T00:00:00",
              },
            ],
          }),
        };
      }
      return { json: async () => ({ success: true, results: [], totalPages: 1 }) };
    });

    const res = await POST(makeCronPost());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobsImported).toBe(1);
    expect(body.accountingInvoiceCount).toBe(1);
    expect(body.lineItemEndpointFound).toBe("/Accounting/GetInvoicesToSend");
    expect(body.lineItemsForImport).toBe(1);
    expect(body.rateCardPartsUpserted).toBe(1);
    // Line item persisted against the imported job
    expect(prismaAll.ascoraLineItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ascoraJobId: "dbjob_1",
          partNumber: "DEHU-LGR",
          unitPriceExTax: 88,
        }),
      }),
    );
    // Rate card seeded with the sell price, no uplift, distinct source tag
    expect(prismaAll.scopePricingDatabase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          partNumber: "AFD-500",
          averageUnitPriceAU: 95,
          source: "ascora-rate-card",
        }),
      }),
    );
    // Combined narrative reached HistoricalJob
    expect(prismaAll.historicalJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          scopeOfWorks: expect.stringContaining("Work undertaken: Dried structure"),
        }),
      }),
    );
  });

  it("bootstraps the integration from env and completes a sync end-to-end", async () => {
    process.env.ASCORA_API_KEY = "test-key";
    process.env.ASCORA_SYNC_USER_EMAIL = "owner@example.com";
    p.user.findUnique.mockResolvedValue({ id: "u_owner" });
    p.ascoraIntegration.findUnique.mockResolvedValue(null); // no row yet
    p.ascoraIntegration.create.mockImplementation(async ({ data }: any) => ({
      id: "int_1",
      ...data,
      lastSyncAt: null,
    }));
    p.ascoraIntegration.update.mockResolvedValue({});
    // Every Ascora call returns an empty, well-formed page
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, results: [], totalPages: 1 }),
    });

    const res = await POST(makeCronPost());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.jobsImported).toBe(0);
    // Record was provisioned for the configured user with the encrypted env key
    expect(p.ascoraIntegration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u_owner",
          apiKey: "enc:test-key",
          isActive: true,
        }),
      }),
    );
    // Outbound Ascora calls used the decrypted key
    const firstCall = mockFetch.mock.calls[0];
    expect(firstCall[1].headers.Auth).toBe("test-key");
  });
});
