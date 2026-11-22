/**
 * RA-8515 — office intake text is stored as typed. Escaping happens where it
 * is rendered, never before the save.
 */
import { describe, expect, it } from "vitest";
import { parseOfficeIntake } from "@/lib/jobs/office-intake";
import { makeSafeStateFromResponse } from "@/lib/jobs/intake-make-safe";

const base = {
  propertyAddress: "12 O'Connell Street, Parramatta NSW",
  propertyPostcode: "2150",
  clientType: "CLIENT",
  claimType: "WATER",
};

describe("parseOfficeIntake keeps text as typed (RA-8515)", () => {
  it("keeps an apostrophe in a name and an address", () => {
    const parsed = parseOfficeIntake({ ...base, insuredName: "Pat O'Brien" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.insuredName).toBe("Pat O'Brien");
    expect(parsed.data.propertyAddress).toBe("12 O'Connell Street, Parramatta NSW");
  });

  it("keeps < and & in office notes", () => {
    const parsed = parseOfficeIntake({ ...base, officeNotes: "RH < 40% & falling <b>bold</b>" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.officeNotes).toBe("RH < 40% & falling <b>bold</b>");
  });

  it("still removes the characters Postgres rejects", () => {
    const parsed = parseOfficeIntake({ ...base, officeNotes: `a${String.fromCharCode(0)}b\uD800c` });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.officeNotes).toBe("abc");
  });

  it("still caps the length", () => {
    const parsed = parseOfficeIntake({ ...base, insuredName: "x".repeat(500) });
    expect(parsed.ok && parsed.data.insuredName?.length).toBe(200);
  });
});

describe("makeSafeStateFromResponse (RA-8515)", () => {
  it("reads true and false as they are", () => {
    expect(makeSafeStateFromResponse(true)).toBe("seeded");
    expect(makeSafeStateFromResponse(false)).toBe("not-seeded");
  });

  it("never reads null or a missing value as seeded", () => {
    expect(makeSafeStateFromResponse(null)).toBe("unknown");
    expect(makeSafeStateFromResponse(undefined)).toBe("unknown");
  });
});
