import { describe, expect, it } from "vitest";
import { reservedEmailSignUpMessage } from "../reserved-email-user-message";

describe("reservedEmailSignUpMessage", () => {
  it("blocks .test", () => {
    expect(reservedEmailSignUpMessage("user@firm.test")).toMatch(/reserved/i);
  });

  it("allows real domains", () => {
    expect(reservedEmailSignUpMessage("user@acme.com.au")).toBeNull();
  });
});
