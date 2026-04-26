import { describe, expect, it } from "vitest";
import {
  getDomainPlugin,
  isRegisteredDomain,
  listDomainKeys,
  listDomains,
} from "../registry";

describe("assessment registry", () => {
  it("registers at least the WATER domain for V1", () => {
    expect(listDomainKeys()).toContain("WATER");
  });

  it("returns the plug-in for a registered domain", () => {
    const p = getDomainPlugin("WATER");
    expect(p).not.toBeNull();
    expect(p?.domain).toBe("WATER");
    expect(typeof p?.label).toBe("string");
    expect(typeof p?.generate).toBe("function");
  });

  it("registers the MOULD domain", () => {
    const p = getDomainPlugin("MOULD");
    expect(p).not.toBeNull();
    expect(p?.domain).toBe("MOULD");
  });

  it("registers the BIOHAZARD domain", () => {
    expect(getDomainPlugin("BIOHAZARD")).not.toBeNull();
  });

  it("registers the FIRE_SMOKE domain", () => {
    expect(getDomainPlugin("FIRE_SMOKE")).not.toBeNull();
  });

  it("registers the STORM domain", () => {
    expect(getDomainPlugin("STORM")).not.toBeNull();
  });

  it("returns null for an unregistered domain", () => {
    // HVAC / AUSTRALIAN_COMPLIANCE remain unregistered — they land in
    // subsequent PRs.
    expect(getDomainPlugin("HVAC")).toBeNull();
    expect(getDomainPlugin("UNREGISTERED" as never)).toBeNull();
  });

  it("isRegisteredDomain returns true for known and false for unknown", () => {
    expect(isRegisteredDomain("WATER")).toBe(true);
    expect(isRegisteredDomain("FAKE")).toBe(false);
  });

  it("listDomains returns the same length as listDomainKeys (consistency)", () => {
    expect(listDomains().length).toBe(listDomainKeys().length);
  });
});
