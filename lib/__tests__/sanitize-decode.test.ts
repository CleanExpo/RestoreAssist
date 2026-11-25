import { describe, expect, it } from "vitest";
import { decodeSanitizedEntities, sanitizeString } from "../sanitize";

describe("decodeSanitizedEntities (RA-8516)", () => {
  it("undoes sanitizeString once", () => {
    for (const name of ["O'Brien", 'Sam "Sparky" Lee', "Smith & Sons", "RH < 40%"]) {
      expect(decodeSanitizedEntities(sanitizeString(name))).toBe(name);
    }
  });

  it("also reads the &#039; spelling escapeHtml writes", () => {
    expect(decodeSanitizedEntities("O&#039;Brien")).toBe("O'Brien");
  });

  it("decodes in a single pass", () => {
    expect(decodeSanitizedEntities("&amp;lt;")).toBe("&lt;");
  });

  it("leaves other text alone", () => {
    expect(decodeSanitizedEntities("Plain name &nbsp; &copy;")).toBe("Plain name &nbsp; &copy;");
  });
});
