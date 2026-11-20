import { describe, expect, it } from "vitest";
import { isPulseDemoOrReservedRecipient } from "../undeliverable-recipient";

describe("isPulseDemoOrReservedRecipient", () => {
  it("blocks the legacy signup sample on deliverable example.com.au", () => {
    expect(
      isPulseDemoOrReservedRecipient("sample.client@example.com.au"),
    ).toBe(true);
    expect(
      isPulseDemoOrReservedRecipient("  SAMPLE.CLIENT@EXAMPLE.COM.AU  "),
    ).toBe(true);
  });

  it("blocks reserved-domain demo and fixture addresses", () => {
    expect(
      isPulseDemoOrReservedRecipient("sample.client@restoreassist.invalid"),
    ).toBe(true);
    expect(
      isPulseDemoOrReservedRecipient("sample.client@example.com"),
    ).toBe(true);
    expect(
      isPulseDemoOrReservedRecipient("ref-abc@example.com"),
    ).toBe(true);
    expect(
      isPulseDemoOrReservedRecipient("claims@demo-insurance.example"),
    ).toBe(true);
  });

  it("does not block a real-looking homeowner address", () => {
    expect(isPulseDemoOrReservedRecipient("home@owner.test")).toBe(false);
    expect(
      isPulseDemoOrReservedRecipient("jane.smith@restoreassist.com.au"),
    ).toBe(false);
  });
});
