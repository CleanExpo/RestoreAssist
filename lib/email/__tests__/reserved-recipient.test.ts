import { describe, expect, it } from "vitest";
import { isDemoOrReservedRecipient } from "../reserved-recipient";

describe("isDemoOrReservedRecipient", () => {
  it("blocks the legacy signup sample on deliverable example.com.au", () => {
    expect(isDemoOrReservedRecipient("sample.client@example.com.au")).toBe(
      true,
    );
    expect(
      isDemoOrReservedRecipient("  SAMPLE.CLIENT@EXAMPLE.COM.AU  "),
    ).toBe(true);
  });

  it("strips plus-tags before the exact leftover-sample match", () => {
    expect(
      isDemoOrReservedRecipient("sample.client+tag@example.com.au"),
    ).toBe(true);
    expect(
      isDemoOrReservedRecipient("  SAMPLE.CLIENT+Promo@Example.Com.Au  "),
    ).toBe(true);
  });

  it("blocks RFC 6761 .test as well as .invalid/.example, and leftover OAuth .local", () => {
    expect(isDemoOrReservedRecipient("bob@owner.test")).toBe(true);
    expect(isDemoOrReservedRecipient("sample.client@restoreassist.invalid")).toBe(
      true,
    );
    expect(isDemoOrReservedRecipient("bob@client.example")).toBe(true);
    expect(isDemoOrReservedRecipient("spine@example.com")).toBe(true);
    expect(
      isDemoOrReservedRecipient("ext-integration_1-xero-2@client.local"),
    ).toBe(true);
  });

  it("does not block a real-looking homeowner address", () => {
    expect(isDemoOrReservedRecipient("client@x.com")).toBe(false);
    expect(
      isDemoOrReservedRecipient("jane.smith@restoreassist.com.au"),
    ).toBe(false);
  });
});
