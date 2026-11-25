import { describe, expect, it } from "vitest";
import { parseEmail } from "../email";

describe("parseEmail (RA-8516)", () => {
  it.each([
    ["office@example.com", "office@example.com"],
    ["  office@example.com ", "office@example.com"],
    ["o.brien+jobs@sub.example.com.au", "o.brien+jobs@sub.example.com.au"],
  ])("accepts %j", (input, expected) => {
    expect(parseEmail(input)).toBe(expected);
  });

  it.each([
    "office@example.com,other.invalid",
    "office@example.com other@example.com",
    "office@example.com;other@example.com",
    "office@example..com",
    "office@.example.com",
    "office@example.com.",
    "front desk",
    "office@localhost",
    "@example.com",
    "office@",
    "",
    "   ",
  ])("refuses %j", (input) => {
    expect(parseEmail(input)).toBeNull();
  });

  it("refuses an address longer than 254 characters", () => {
    expect(parseEmail(`${"a".repeat(64)}@${"b".repeat(186)}.com`)).toBeNull();
  });

  it("refuses non-strings", () => {
    expect(parseEmail(null)).toBeNull();
    expect(parseEmail(undefined)).toBeNull();
    expect(parseEmail(42)).toBeNull();
  });
});
