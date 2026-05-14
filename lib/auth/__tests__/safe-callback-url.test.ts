/**
 * safe-callback-url.test.ts
 *
 * Unit tests for the same-origin callbackUrl validator used by /login.
 * Punch-list P1 #16: protected routes lose intended-destination on /login redirect.
 */

import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "../safe-callback-url";

describe("safeCallbackUrl", () => {
  it("returns a relative path unchanged", () => {
    expect(safeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl("/dashboard/inspections/123")).toBe(
      "/dashboard/inspections/123",
    );
    expect(safeCallbackUrl("/")).toBe("/");
  });

  it("preserves query and fragment portions of the path", () => {
    expect(safeCallbackUrl("/dashboard?tab=open")).toBe("/dashboard?tab=open");
    expect(safeCallbackUrl("/reports/42#summary")).toBe("/reports/42#summary");
  });

  it("falls back when value is missing", () => {
    expect(safeCallbackUrl(null)).toBe("/dashboard");
    expect(safeCallbackUrl(undefined)).toBe("/dashboard");
    expect(safeCallbackUrl("")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeCallbackUrl("//evil.com")).toBe("/dashboard");
    expect(safeCallbackUrl("//evil.com/dashboard")).toBe("/dashboard");
  });

  it("rejects absolute URLs", () => {
    expect(safeCallbackUrl("https://evil.com/dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl("http://evil.com")).toBe("/dashboard");
    // Embedded scheme anywhere in the string disqualifies — strictest read of
    // the brief: "does NOT contain '://'".
    expect(safeCallbackUrl("/redirect?to=https://evil.com")).toBe("/dashboard");
  });

  it("rejects values that do not start with /", () => {
    expect(safeCallbackUrl("dashboard")).toBe("/dashboard");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/dashboard");
  });

  it("respects a custom fallback", () => {
    expect(safeCallbackUrl(null, "/portal")).toBe("/portal");
    expect(safeCallbackUrl("//evil.com", "/portal")).toBe("/portal");
  });
});
