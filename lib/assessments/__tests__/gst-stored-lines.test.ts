/**
 * RA-8281 review round 1 — gstTreatmentForStoredLines labels the GST a
 * stored estimate was priced at, never the org's current country.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { getGstTreatment } from "@/lib/gst-rules";
import { gstTreatmentForStoredLines } from "../gst";

const AU = getGstTreatment("AU");
const NZ = getGstTreatment("NZ");
const line = (ex: number | null, rate: number) => ({
  lineTotalExGst: ex,
  lineTotalIncGst: ex === null ? null : +(ex * (1 + rate)).toFixed(2),
});

describe("gstTreatmentForStoredLines", () => {
  it("10% lines are AU even when the fallback is NZ", () => {
    expect(gstTreatmentForStoredLines([line(200, 0.1)], NZ)?.currency).toBe(
      "AUD",
    );
  });

  it("15% lines are NZ even when the fallback is AU", () => {
    expect(gstTreatmentForStoredLines([line(200, 0.15)], AU)?.currency).toBe(
      "NZD",
    );
  });

  it("allows one cent of rounding per line", () => {
    expect(
      gstTreatmentForStoredLines(
        [{ lineTotalExGst: 33.33, lineTotalIncGst: 36.66 }],
        NZ,
      )?.country,
    ).toBe("AU");
  });

  it("lines with no priced amount use the fallback", () => {
    expect(gstTreatmentForStoredLines([line(null, 0)], NZ)).toBe(NZ);
    expect(gstTreatmentForStoredLines([], AU)).toBe(AU);
  });

  it("a rate that is neither 10% nor 15% gives null", () => {
    expect(gstTreatmentForStoredLines([line(200, 0.12)], AU)).toBeNull();
    expect(
      gstTreatmentForStoredLines([line(200, 0.1), line(100, 0.12)], AU),
    ).toBeNull();
  });

  it("lines carrying different rates give null", () => {
    expect(
      gstTreatmentForStoredLines([line(200, 0.1), line(100, 0.15)], AU),
    ).toBeNull();
  });
});
