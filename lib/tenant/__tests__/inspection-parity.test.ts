import { describe, it, expect } from "vitest";
import { compareInspectionParity } from "../inspection-parity";

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  propertyAddress: "12 Smith St",
  propertyPostcode: "4000",
  ...extra,
});

describe("compareInspectionParity", () => {
  it("reports a full match when both sides hold identical rows", () => {
    const shared = [row("a"), row("b")];
    const tenant = [row("b"), row("a")]; // order-independent
    const r = compareInspectionParity(shared, tenant);
    expect(r.match).toBe(true);
    expect(r.total).toBe(2);
    expect(r.matched).toBe(2);
    expect(r.missingInTenant).toEqual([]);
    expect(r.extraInTenant).toEqual([]);
    expect(r.fieldMismatches).toEqual([]);
  });

  it("flags a row present in shared but missing from tenant", () => {
    const r = compareInspectionParity([row("a"), row("b")], [row("a")]);
    expect(r.match).toBe(false);
    expect(r.missingInTenant).toEqual(["b"]);
  });

  it("flags a row present in tenant but not shared", () => {
    const r = compareInspectionParity([row("a")], [row("a"), row("x")]);
    expect(r.match).toBe(false);
    expect(r.extraInTenant).toEqual(["x"]);
  });

  it("names the id and the differing fields on a value mismatch", () => {
    const shared = [row("a", { propertyPostcode: "4000" })];
    const tenant = [row("a", { propertyPostcode: "4999" })];
    const r = compareInspectionParity(shared, tenant);
    expect(r.match).toBe(false);
    expect(r.fieldMismatches).toEqual([{ id: "a", fields: ["propertyPostcode"] }]);
  });

  it("compares only the requested fields when compareFields is given", () => {
    const shared = [row("a", { technicianName: "Dave", ignored: 1 })];
    const tenant = [row("a", { technicianName: "Dave", ignored: 999 })];
    const r = compareInspectionParity(shared, tenant, {
      compareFields: ["propertyAddress", "propertyPostcode", "technicianName"],
    });
    expect(r.match).toBe(true);
  });
});
