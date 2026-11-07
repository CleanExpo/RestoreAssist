import { describe, expect, it } from "vitest";
import { isDemoOrReservedRecipient } from "../reserved-recipient";

describe("reserved-recipient — signup path (RA-8156)", () => {
  it("treats plus-tagged reserved demo address as blocked", () => {
    expect(isDemoOrReservedRecipient("sample.client+tag@example.com.au")).toBe(
      true,
    );
  });
});
