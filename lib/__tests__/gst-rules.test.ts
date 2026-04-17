import { describe, it, expect } from "vitest";
import { getGstTreatment, computeGstCents } from "../gst-rules";

describe("getGstTreatment", () => {
  it("returns 10% rate for AU", () => {
    const treatment = getGstTreatment("AU");
    expect(treatment.rate).toBe(0.1);
    expect(treatment.percentLabel).toBe("10%");
    expect(treatment.xeroTaxType).toBe("OUTPUT");
    expect(treatment.myobTaxCode).toBe("GST");
    expect(treatment.qboTaxRateName).toBe("GST");
  });

  it("returns 15% rate for NZ", () => {
    const treatment = getGstTreatment("NZ");
    expect(treatment.rate).toBe(0.15);
    expect(treatment.percentLabel).toBe("15%");
    expect(treatment.xeroTaxType).toBe("OUTPUT2");
    expect(treatment.myobTaxCode).toBe("GST15");
    expect(treatment.qboTaxRateName).toBe("GST NZ");
  });
});

describe("computeGstCents", () => {
  it("computes 10% GST in cents for AU", () => {
    expect(computeGstCents(10000, "AU")).toBe(1000);
  });

  it("computes 15% GST in cents for NZ", () => {
    expect(computeGstCents(10000, "NZ")).toBe(1500);
  });

  it("rounds half-cent correctly", () => {
    // 0.10 * 10001 = 1000.1 → rounds to 1000
    expect(computeGstCents(10001, "AU")).toBe(1000);
    // 0.15 * 10001 = 1500.15 → rounds to 1500
    expect(computeGstCents(10001, "NZ")).toBe(1500);
  });
});
