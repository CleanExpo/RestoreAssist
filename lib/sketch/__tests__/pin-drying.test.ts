import { describe, expect, it } from "vitest";
import { pinDryingStatus } from "../pin-drying";

describe("pinDryingStatus (S500 drying validation on moisture pins)", () => {
  it("flags a reading at/below the material dry target as dry", () => {
    // timber_floor dry target = 12% WME
    const r = pinDryingStatus({ wme: 10, material: "timber_floor" });
    expect(r.dryStandardMet).toBe(true);
    expect(r.status).toBe("dry");
    expect(r.targetMc).toBe(12);
  });

  it("flags a reading above the dry target as not yet dry", () => {
    const r = pinDryingStatus({ wme: 20, material: "timber_floor" });
    expect(r.dryStandardMet).toBe(false);
    expect(r.status).toBe("not_dry");
  });

  it("treats the boundary value as dry", () => {
    // plasterboard dry target = 16
    expect(
      pinDryingStatus({ wme: 16, material: "plasterboard" }).dryStandardMet,
    ).toBe(true);
  });

  it("falls back to a sane target for an unknown material", () => {
    const r = pinDryingStatus({
      wme: 10,
      material: "definitely_not_a_material" as never,
    });
    expect(typeof r.targetMc).toBe("number");
    expect(r.dryStandardMet).toBe(true);
  });
});
