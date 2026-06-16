import { describe, it, expect, afterEach } from "vitest";
import { getFromEmail } from "../email";

describe("getFromEmail", () => {
  const original = process.env.RESEND_FROM_EMAIL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RESEND_FROM_EMAIL;
    } else {
      process.env.RESEND_FROM_EMAIL = original;
    }
  });

  it("returns the configured from address when RESEND_FROM_EMAIL is set", () => {
    process.env.RESEND_FROM_EMAIL = "Restore Assist <noreply@restoreassist.app>";
    expect(getFromEmail()).toBe("Restore Assist <noreply@restoreassist.app>");
  });

  it("throws fast when RESEND_FROM_EMAIL is unset (no silent resend.dev sandbox fallback)", () => {
    delete process.env.RESEND_FROM_EMAIL;
    expect(() => getFromEmail()).toThrow(/RESEND_FROM_EMAIL/);
  });
});
