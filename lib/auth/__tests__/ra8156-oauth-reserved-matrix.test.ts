/**
 * RA-8156 — reserved identity matrix (signup helper).
 */
import { describe, expect, it } from "vitest";
import { reservedEmailSignUpMessage } from "../reserved-email-user-message";
import { isDemoOrReservedRecipient } from "@/lib/email/reserved-recipient";

describe("RA-8156 identity matrix", () => {
  it("blocks .test, .invalid, example.com, and @client.local", () => {
    for (const email of [
      "a@b.test",
      "a@host.invalid",
      "a@sub.example.com",
      "x@client.local",
    ]) {
      expect(isDemoOrReservedRecipient(email)).toBe(true);
      expect(reservedEmailSignUpMessage(email)).toBeTruthy();
    }
  });

  it("allows normal contractor email", () => {
    expect(reservedEmailSignUpMessage("tech@floodservice.com.au")).toBeNull();
  });
});
