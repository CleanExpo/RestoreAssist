import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NCC_EDITION, getNccEdition } from "../ncc-edition";
import { getNccReference, listNccTopics } from "../ncc";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("NCC edition (configurable)", () => {
  it("without a state, returns the edition in force in EVERY jurisdiction", () => {
    vi.stubEnv("NCC_EDITION", "");
    // Deliberately NOT DEFAULT_NCC_EDITION. NCC 2022 was superseded by
    // Amendment 1 (1 May 2025) then Amendment 2 (29 July 2025), so plain
    // "NCC 2022" has not been the answer anywhere since mid-2025.
    expect(getNccEdition(undefined, "2026-08-31")).toBe("NCC 2022 Amendment 2");
    expect(getNccEdition(undefined, "2026-08-31")).not.toBe(DEFAULT_NCC_EDITION);
  });

  it("rolls to a new edition via NCC_EDITION without a code change", () => {
    vi.stubEnv("NCC_EDITION", "NCC 2025");
    expect(getNccEdition()).toBe("NCC 2025");
  });

  it("the env override wins over the adoption table", () => {
    vi.stubEnv("NCC_EDITION", "NCC 2019");
    expect(getNccEdition("VIC", "2026-08-31")).toBe("NCC 2019");
  });

  it("returns null for New Zealand — there is no NCC there", () => {
    vi.stubEnv("NCC_EDITION", "");
    expect(getNccEdition("NZ")).toBeNull();
  });
});

describe("NCC reference attachment", () => {
  it("attaches AS 3740 + Volume Two for wet-area waterproofing reinstatement", () => {
    const ref = getNccReference("wet-area-waterproofing");
    expect(ref).not.toBeNull();
    expect(ref!.volume).toBe("Volume Two");
    expect(ref!.australianStandard).toBe("AS 3740");
    expect(ref!.edition).toBe(getNccEdition());
  });

  it("carries the configured edition through to the reference", () => {
    vi.stubEnv("NCC_EDITION", "NCC 2025");
    expect(getNccReference("wet-area-waterproofing")!.edition).toBe("NCC 2025");
  });

  it("attaches no NCC reference when no edition is in force (NZ)", () => {
    vi.stubEnv("NCC_EDITION", "");
    expect(getNccReference("wet-area-waterproofing", null)).toBeNull();
  });

  it("honours an explicit edition argument over the env default", () => {
    const ref = getNccReference("wet-area-waterproofing", "NCC 2019");
    expect(ref!.edition).toBe("NCC 2019");
  });

  it("returns null for an unknown topic", () => {
    expect(getNccReference("not-a-real-topic")).toBeNull();
  });

  it("exposes the available topics", () => {
    expect(listNccTopics()).toContain("wet-area-waterproofing");
  });
});
