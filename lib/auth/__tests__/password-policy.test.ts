/**
 * RA-8417 — one owner for the staff password rule (12 characters, RA-1342).
 * The change-password screen used its own copy (8 characters plus capital,
 * lower case and number) that disagreed with the server in both directions.
 */
import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordRuleError } from "../password-policy";
import { RESET_PASSWORD_MIN_LENGTH } from "../recovery-policy";

describe("password policy", () => {
  it("is 12 characters, and reset uses the same value", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(RESET_PASSWORD_MIN_LENGTH).toBe(PASSWORD_MIN_LENGTH);
  });

  it("refuses a 10-character password the old screen accepted", () => {
    expect(passwordRuleError("Summer2026")).toMatch(/at least 12 characters/);
  });

  it("accepts a long lower-case passphrase the old screen blocked", () => {
    expect(passwordRuleError("correct horse battery staple")).toBeNull();
  });

  it("accepts exactly 12 characters and refuses 11", () => {
    expect(passwordRuleError("a".repeat(12))).toBeNull();
    expect(passwordRuleError("a".repeat(11))).not.toBeNull();
  });
});
