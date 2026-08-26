import { describe, it, expect, afterEach } from "vitest";
import { getFromEmail } from "../email";

describe("getFromEmail", () => {
  const originalSender = process.env.SENDER_EMAIL;

  afterEach(() => {
    if (originalSender === undefined) delete process.env.SENDER_EMAIL;
    else process.env.SENDER_EMAIL = originalSender;
  });

  it("formats SENDER_EMAIL with the RestoreAssist display name", () => {
    process.env.SENDER_EMAIL = "support@restoreassist.app";
    expect(getFromEmail()).toBe("RestoreAssist <support@restoreassist.app>");
  });

  it("throws fast when SENDER_EMAIL is unset", () => {
    delete process.env.SENDER_EMAIL;
    expect(() => getFromEmail()).toThrow(/SENDER_EMAIL/);
  });
});
