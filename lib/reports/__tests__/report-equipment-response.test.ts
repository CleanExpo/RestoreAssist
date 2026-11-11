/**
 * RA-8281 B1 round 13 (review finding): a route that answers with a whole
 * saved Report row must not echo the rate cached on each stored equipment
 * line or the cached equipmentCostTotal. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const resolveReportPricing = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
}));
vi.mock("@/lib/pricing/report-pricing", () => ({
  resolveReportPricing: (...a: unknown[]) => resolveReportPricing(...a),
}));

import {
  currentReportEquipment,
  withCurrentEquipment,
} from "../report-equipment-response";
import { withoutCachedEquipmentMoney } from "../stored-equipment-pricing";

const CREATED = new Date("2026-10-01T00:00:00Z");
const STALE = JSON.stringify([{ groupId: "lgr-85", quantity: 1, dailyRate: 61 }]);

function row(equipmentSelection: string | null) {
  return {
    id: "r1",
    title: "Synthetic report",
    userId: "creator-1",
    createdAt: CREATED,
    equipmentSelection,
    equipmentCostTotal: 244 as number | null,
    estimatedDryingDuration: 4 as number | null,
  };
}

beforeEach(() => {
  userFindUnique.mockReset();
  resolveReportPricing.mockReset();
  userFindUnique.mockResolvedValue({ pricingConfig: { id: "creator-own" } });
});

describe("withCurrentEquipment", () => {
  it("replaces the cached rate and total with the current price list's", async () => {
    resolveReportPricing.mockResolvedValue({ ok: true, pricingConfig: { dehumidifierLGRDailyRate: 70 } });
    const out = await withCurrentEquipment(row(STALE));
    expect(out.title).toBe("Synthetic report");
    expect(out.equipmentSelection?.[0]).toMatchObject({ groupId: "lgr-85", dailyRate: 70 });
    expect(out.equipmentCostTotal).toBe(280);
    expect(userFindUnique.mock.calls[0][0].where).toEqual({ id: "creator-1" });
    expect(resolveReportPricing).toHaveBeenCalledWith("creator-1", { id: "creator-own" }, CREATED);
  });

  it("a cleared rate reads rate not set: no 61 and no 244 anywhere in the answer", async () => {
    resolveReportPricing.mockResolvedValue({ ok: true, pricingConfig: { dehumidifierLGRDailyRate: null } });
    const out = await withCurrentEquipment(row(STALE));
    expect(out.equipmentSelection?.[0].dailyRate).toBeNull();
    expect(out.equipmentCostTotal).toBeNull();
    const text = JSON.stringify(out);
    expect(text).not.toContain("244");
    expect(text).not.toContain("61");
  });

  it("an unconfirmed business gets no price list", async () => {
    resolveReportPricing.mockResolvedValue({ ok: false });
    const out = await withCurrentEquipment(row(STALE));
    expect(out.equipmentSelection?.[0].dailyRate).toBeNull();
    expect(out.equipmentCostTotal).toBeNull();
  });

  it("nothing stored: null lines, null total (a stale cached total is dropped), no price-list read", async () => {
    const out = await withCurrentEquipment(row(null));
    expect(out.equipmentSelection).toBeNull();
    expect(out.equipmentCostTotal).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(resolveReportPricing).not.toHaveBeenCalled();
  });

  it("a missing row stays null", async () => {
    expect(await withCurrentEquipment(null)).toBeNull();
  });

  it("currentReportEquipment prices a 1-day default when no duration is stored", async () => {
    resolveReportPricing.mockResolvedValue({ ok: true, pricingConfig: { dehumidifierLGRDailyRate: 70 } });
    const out = await currentReportEquipment({ ...row(STALE), estimatedDryingDuration: null });
    expect(out.equipmentCostTotal).toBe(70);
  });
});

describe("withoutCachedEquipmentMoney (bulk exports that cannot reprice)", () => {
  it("keeps the readable lines without their cached rate and leaves the cached total out", () => {
    const out = withoutCachedEquipmentMoney(
      row(JSON.stringify([null, { groupId: "lgr-85", quantity: 2, dailyRate: 61 }])),
    );
    expect(out.equipmentSelection).toEqual([{ groupId: "lgr-85", quantity: 2 }]);
    // The null entry could not be read: the row says so instead of reading
    // as the whole saved list.
    expect(out.equipmentSelectionUnreadableLines).toBe(1);
    expect("equipmentCostTotal" in out).toBe(false);
    expect(out.title).toBe("Synthetic report");
    const text = JSON.stringify(out);
    expect(text).not.toContain("244");
    expect(text).not.toContain("61");
  });

  it("nothing stored stays null", () => {
    expect(withoutCachedEquipmentMoney(row(null)).equipmentSelection).toBeNull();
  });

  it("a fully readable list carries no unreadable count", () => {
    const out = withoutCachedEquipmentMoney(row(JSON.stringify([{ groupId: "lgr-85", quantity: 2 }])));
    expect("equipmentSelectionUnreadableLines" in out).toBe(false);
  });
});
