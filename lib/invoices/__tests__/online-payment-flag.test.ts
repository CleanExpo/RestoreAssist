import { describe, expect, it } from "vitest";
import { isInvoiceOnlinePaymentEnabled } from "../online-payment";

/**
 * P1-MNY-01 — invoice card payment is OFF unless the environment says exactly
 * "true". Anything else (unset, "1", "TRUE", " true", "yes") stays off, so a
 * typo can never switch real card payments on.
 * Sabotage: make the check truthy or case-insensitive — the "TRUE"/"1" cases fail.
 */
describe("INVOICE_ONLINE_PAYMENT_ENABLED", () => {
  it("is off when unset", () => {
    expect(isInvoiceOnlinePaymentEnabled({})).toBe(false);
  });

  it.each(["", "1", "TRUE", "True", " true", "true ", "yes", "on", "false"])(
    "is off for %j",
    (value) => {
      expect(
        isInvoiceOnlinePaymentEnabled({ INVOICE_ONLINE_PAYMENT_ENABLED: value }),
      ).toBe(false);
    },
  );

  it("is on only for the exact string 'true'", () => {
    expect(
      isInvoiceOnlinePaymentEnabled({ INVOICE_ONLINE_PAYMENT_ENABLED: "true" }),
    ).toBe(true);
  });

  it("reads process.env by default", () => {
    const prev = process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
    try {
      delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
      expect(isInvoiceOnlinePaymentEnabled()).toBe(false);
      process.env.INVOICE_ONLINE_PAYMENT_ENABLED = "true";
      expect(isInvoiceOnlinePaymentEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.INVOICE_ONLINE_PAYMENT_ENABLED;
      else process.env.INVOICE_ONLINE_PAYMENT_ENABLED = prev;
    }
  });
});
