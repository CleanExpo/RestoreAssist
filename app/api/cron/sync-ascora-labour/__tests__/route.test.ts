/**
 * RA-7026 — batched Ascora labour importer.
 *
 * /Jobs/JobLabour/{jobNumber} is one call per job (4,003 jobs), far beyond a
 * single function invocation, so an hourly cron drains jobs where
 * labourSyncedAt IS NULL in batches. Chargeable labour becomes
 * LABOUR-<ROLE> AscoraLineItem rows (same pricing benchmark the leakage
 * analyzer reads). The cursor advances even for zero-labour jobs; fetch
 * failures leave the cursor unset so the job retries next run.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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
    cronJobRun: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    ascoraIntegration: { findFirst: vi.fn(), findUnique: vi.fn() },
    ascoraJob: { findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    ascoraLineItem: { deleteMany: vi.fn(), create: vi.fn() },
    scopePricingDatabase: { upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { verifyCronAuth } from "@/lib/cron/auth";
import { prisma } from "@/lib/prisma";
import { fetchAscoraWithRetry } from "@/lib/integrations/ascora/fetch-with-retry";
import { GET } from "../route";

const mockVerifyCronAuth = verifyCronAuth as unknown as ReturnType<typeof vi.fn>;
const mockFetch = fetchAscoraWithRetry as unknown as ReturnType<typeof vi.fn>;
const p = prisma as any;

function makeGet(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/cron/sync-ascora-labour${qs}`, {
    method: "GET",
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronAuth.mockReturnValue(null);
  p.cronJobRun.findFirst.mockResolvedValue(null);
  p.cronJobRun.create.mockResolvedValue({ id: "run_1" });
  p.cronJobRun.update.mockResolvedValue({});
  p.ascoraIntegration.findFirst.mockResolvedValue({
    id: "int_1",
    apiKey: "enc:test-key",
    baseUrl: "https://api.ascora.com.au",
    isActive: true,
  });
  p.ascoraJob.findMany.mockResolvedValue([]);
  p.ascoraJob.count.mockResolvedValue(0);
  p.ascoraJob.update.mockResolvedValue({});
  p.ascoraLineItem.deleteMany.mockResolvedValue({ count: 0 });
  p.ascoraLineItem.create.mockResolvedValue({});
  p.scopePricingDatabase.upsert.mockResolvedValue({});
});

describe("RA-7026 — batched labour importer", () => {
  it("rejects unauthenticated calls", async () => {
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(p.ascoraJob.findMany).not.toHaveBeenCalled();
  });

  it("is a soft no-op (not an error) when no integration exists yet", async () => {
    p.ascoraIntegration.findFirst.mockResolvedValue(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("imports chargeable labour as LABOUR-<ROLE> lines and advances the cursor", async () => {
    p.ascoraJob.findMany.mockResolvedValue([
      { id: "db_1", ascoraJobId: "aj_1", ascoraJobNumber: "DRQ100", claimType: "water" },
      { id: "db_2", ascoraJobId: "aj_2", ascoraJobNumber: "DRQ101", claimType: "mould" },
    ]);
    p.ascoraJob.count.mockResolvedValue(5);
    mockFetch.mockImplementation(async (url: string) => ({
      json: async () =>
        url.endsWith("/DRQ100")
          ? {
              success: true,
              jobLabours: [
                {
                  roleName: "Senior Technician",
                  numberOfHours: 3,
                  hourlyRateExTax: 120,
                  totalAmountExTax: 360,
                  isChargeable: true,
                  startDate: "2024-02-01T08:00:00",
                },
                // zero-rate entry must be filtered out
                {
                  roleName: "Apprentice",
                  numberOfHours: 2,
                  hourlyRateExTax: 0,
                  totalAmountExTax: 0,
                  isChargeable: false,
                  startDate: "2024-02-01T08:00:00",
                },
              ],
            }
          : { success: true, jobLabours: [] },
    }));

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemsProcessed).toBe(2);
    expect(body.metadata.labourLines).toBe(1);
    expect(body.metadata.remaining).toBe(5);

    // Old LABOUR- lines cleared first (idempotent re-run)
    expect(p.ascoraLineItem.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ascoraJobId: "db_1",
          partNumber: { startsWith: "LABOUR-" },
        }),
      }),
    );
    expect(p.ascoraLineItem.create).toHaveBeenCalledTimes(1);
    expect(p.ascoraLineItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ascoraJobId: "db_1",
          partNumber: "LABOUR-SENIOR-TECHNICIAN",
          quantity: 3,
          unitPriceExTax: 120,
          amountExTax: 360,
        }),
      }),
    );
    // Cursor advanced for BOTH jobs — including the zero-labour one
    expect(p.ascoraJob.update).toHaveBeenCalledTimes(2);
    // Labour rates entered the pricing benchmark
    expect(p.scopePricingDatabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partNumber: "LABOUR-SENIOR-TECHNICIAN" } }),
    );
  });

  it("leaves the cursor unset on fetch failure so the job retries next run", async () => {
    p.ascoraJob.findMany.mockResolvedValue([
      { id: "db_1", ascoraJobId: "aj_1", ascoraJobNumber: "DRQ100", claimType: "water" },
      { id: "db_2", ascoraJobId: "aj_2", ascoraJobNumber: "DRQ101", claimType: "water" },
    ]);
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/DRQ100")) throw new Error("Ascora 500");
      return { json: async () => ({ success: true, jobLabours: [] }) };
    });

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata.fetchErrors).toBe(1);
    // Only the successful job's cursor advanced
    expect(p.ascoraJob.update).toHaveBeenCalledTimes(1);
    expect(p.ascoraJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "db_2" } }),
    );
  });

  it("marks jobs without a job number as synced without calling Ascora", async () => {
    p.ascoraJob.findMany.mockResolvedValue([
      { id: "db_1", ascoraJobId: "aj_1", ascoraJobNumber: null, claimType: null },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(p.ascoraJob.update).toHaveBeenCalledTimes(1);
  });
});
