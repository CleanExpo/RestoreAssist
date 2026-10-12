/**
 * RA-7893 — resolveInspectionRates: an inspection is priced at the business
 * it belongs to. The prisma fake holds three pricing rows (the member's own
 * legacy row, the owner's legacy row and the organisation's row), so a lookup
 * against the wrong one shows up as the wrong call-out fee.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  users: {} as Record<string, { organizationId: string | null }>,
  orgPricing: {} as Record<string, { callOutFee: number }>,
  legacyPricing: {} as Record<string, { callOutFee: number }>,
  tenant: null as { ownerId: string; organizationId: string | null } | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.users[where.id] ?? null,
    },
    organizationPricingConfig: {
      findUnique: async ({ where }: { where: { organizationId: string } }) =>
        db.orgPricing[where.organizationId] ?? null,
    },
    companyPricingConfig: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        db.legacyPricing[where.userId] ?? null,
    },
  },
}));

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: async () => db.tenant,
}));

import { resolveInspectionRates } from "@/lib/nir-cost-estimation";

const CREATED_AT = new Date("2026-09-01T00:00:00Z");

describe("resolveInspectionRates", () => {
  beforeEach(() => {
    db.users = {
      owner: { organizationId: "org-1" },
      member: { organizationId: "org-1" },
    };
    db.orgPricing = {};
    db.legacyPricing = {
      owner: { callOutFee: 150 },
      member: { callOutFee: 999 },
    };
    db.tenant = null;
  });

  it("prices an invited member's inspection at the owner's rates, not the member's own", async () => {
    db.tenant = { ownerId: "owner", organizationId: "org-1" };
    const result = await resolveInspectionRates("member", CREATED_AT);
    expect(result).toEqual({
      ok: true,
      rates: expect.objectContaining({ callOutFee: 150 }),
    });
  });

  it("prefers the organisation's rates over the owner's legacy rates", async () => {
    db.tenant = { ownerId: "owner", organizationId: "org-1" };
    db.orgPricing = { "org-1": { callOutFee: 200 } };
    const result = await resolveInspectionRates("member", CREATED_AT);
    expect(result).toEqual({
      ok: true,
      rates: expect.objectContaining({ callOutFee: 200 }),
    });
  });

  it("prices the owner's own inspection at the owner's rates", async () => {
    db.tenant = { ownerId: "owner", organizationId: null };
    const result = await resolveInspectionRates("owner", CREATED_AT);
    expect(result).toEqual({
      ok: true,
      rates: expect.objectContaining({ callOutFee: 150 }),
    });
  });

  it("returns null rates when the business has no saved pricing", async () => {
    db.tenant = { ownerId: "owner", organizationId: "org-1" };
    db.legacyPricing = { member: { callOutFee: 999 } };
    expect(await resolveInspectionRates("member", CREATED_AT)).toEqual({
      ok: true,
      rates: null,
    });
  });

  it("refuses when the inspection's business cannot be proven", async () => {
    db.tenant = null;
    expect(await resolveInspectionRates("member", CREATED_AT)).toEqual({
      ok: false,
    });
  });
});
