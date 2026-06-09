import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NCC_EDITION, getNccEdition } from "../ncc-edition";
import { getNccReference, listNccTopics } from "../ncc";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("NCC edition (configurable)", () => {
  it("defaults to the bundled edition when no env override", () => {
    vi.stubEnv("NCC_EDITION", "");
    expect(getNccEdition()).toBe(DEFAULT_NCC_EDITION);
  });

  it("rolls to a new edition via NCC_EDITION without a code change", () => {
    vi.stubEnv("NCC_EDITION", "NCC 2025");
    expect(getNccEdition()).toBe("NCC 2025");
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
