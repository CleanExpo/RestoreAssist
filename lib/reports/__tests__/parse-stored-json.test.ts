import { describe, expect, it } from "vitest";
import { parseStoredJson } from "../parse-stored-json";

describe("parseStoredJson", () => {
  it("parses valid stored arrays and objects", () => {
    expect(parseStoredJson('[{"room":"Kitchen"}]')).toEqual([
      { room: "Kitchen" },
    ]);
    expect(parseStoredJson('{"count":2}')).toEqual({ count: 2 });
  });

  it("returns null for malformed, empty, or absent legacy values", () => {
    expect(parseStoredJson('{"broken"')).toBeNull();
    expect(parseStoredJson("")).toBeNull();
    expect(parseStoredJson(null)).toBeNull();
  });

  it("preserves already-parsed values", () => {
    const value = [{ room: "Laundry" }];
    expect(parseStoredJson(value)).toBe(value);
  });
});
