import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * RA-7896 — every quote row shows two prices, ex GST and inc GST, worked out
 * per line (RA-7705 rule), and the rows add up to the quote's totals.
 *
 * Expected figures are worked by hand below, not by the production helper.
 */

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  resolveEffectivePricing: vi.fn().mockResolvedValue(null),
}));

const { userFindUnique } = vi.hoisted(() => ({ userFindUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

import { getServerSession } from "next-auth";
import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockReset();
  (getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user_abcd" },
  });
  userFindUnique
    .mockResolvedValueOnce({ subscriptionStatus: "ACTIVE" })
    .mockResolvedValueOnce({
      businessName: "Test Co",
      businessABN: "53 004 085 616",
      businessAddress: "1 St",
      businessPhone: null,
      businessEmail: "a@test.com",
      businessLogo: null,
      organization: { country: "AU" },
    });
});

function calcReq(body: unknown) {
  return new NextRequest("http://localhost/api/calculate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const cents = (dollars: number) => Math.round(dollars * 100);

describe("RA-7896 POST /api/calculate — each row priced ex GST and inc GST", () => {
  it("prices every row and the minimum-charge top-up row, and the rows sum to the totals", async () => {
    const res = await POST(
      calcReq({
        jobType: "water",
        affectedAreaM2: 10,
        numberOfRooms: 1,
        dryingDays: 1,
        labourHours: 1,
        airMoversAxial: 0,
        dehumidifiersLGR: 0,
        includeCallOut: false,
        includeAdminFee: false,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // Default rates, one labour hour: qualified technician $65.00 x 1.
    const labour = json.lineItems.find((li: { description: string }) =>
      /labour/i.test(li.description),
    );
    expect(labour).toMatchObject({ qty: 1, rate: 65, exGST: 65, incGST: 71.5 });

    // Every row: ex GST is the row's subtotal; inc GST adds 10% of that row,
    // rounded to the cent on its own.
    for (const li of json.lineItems) {
      expect(cents(li.exGST)).toBe(cents(li.subtotal));
      expect(cents(li.incGST)).toBe(
        cents(li.exGST) + Math.round(cents(li.exGST) / 10),
      );
    }

    // The $2,750 minimum padded the quote; the top-up is its own row.
    expect(json.minimumApplied).toBe(true);
    const linesEx = json.lineItems.reduce(
      (s: number, li: { exGST: number }) => s + cents(li.exGST),
      0,
    );
    expect(json.minimumChargeLine).toMatchObject({
      description: "Minimum engagement charge (industry minimum)",
    });
    expect(cents(json.minimumChargeLine.exGST)).toBe(275000 - linesEx);

    const rows = [...json.lineItems, json.minimumChargeLine];
    const sumEx = rows.reduce((s, r) => s + cents(r.exGST), 0);
    const sumInc = rows.reduce((s, r) => s + cents(r.incGST), 0);
    expect(sumEx).toBe(cents(json.subtotalExGST));
    expect(sumInc).toBe(cents(json.totalIncGST));
    expect(sumInc - sumEx).toBe(cents(json.gst));
  });

  it("has no top-up row when the lines already exceed the minimum", async () => {
    const res = await POST(
      calcReq({
        jobType: "water",
        affectedAreaM2: 10,
        numberOfRooms: 1,
        dryingDays: 1,
        labourHours: 50,
        airMoversAxial: 0,
        dehumidifiersLGR: 0,
        includeCallOut: false,
        includeAdminFee: false,
      }),
    );
    const json = await res.json();
    expect(json.minimumApplied).toBe(false);
    expect(json.minimumChargeLine).toBeNull();
    const sumInc = json.lineItems.reduce(
      (s: number, li: { incGST: number }) => s + cents(li.incGST),
      0,
    );
    expect(sumInc).toBe(cents(json.totalIncGST));
  });
});
