/**
 * RA-8398: the one shared line check for invoice-style money lines.
 */
import { describe, expect, it } from "vitest";
import { findInvalidMoneyLine } from "@/lib/invoices/validate-money-lines";

const good = { description: "Labour", quantity: 2, unitPrice: 1500, gstRate: 10 };

describe("findInvalidMoneyLine", () => {
  it("accepts valid lines, numeric strings and an omitted GST rate", () => {
    expect(findInvalidMoneyLine([good])).toBeNull();
    expect(
      findInvalidMoneyLine([{ quantity: "1.5", unitPrice: "200", gstRate: "0" }]),
    ).toBeNull();
    for (const gstRate of [undefined, null, ""]) {
      expect(findInvalidMoneyLine([{ quantity: 1, unitPrice: 1, gstRate }])).toBeNull();
    }
    expect(findInvalidMoneyLine([{ quantity: 0, unitPrice: 0, gstRate: 0 }])).toBeNull();
  });

  it("requires at least one line", () => {
    for (const lines of [undefined, null, [], "x", {}]) {
      expect(findInvalidMoneyLine(lines)).toMatchObject({
        index: -1,
        field: "lineItems",
      });
    }
  });

  it.each([
    ["negative quantity", { quantity: -1 }, "quantity"],
    ["text quantity", { quantity: "abc" }, "quantity"],
    ["partly numeric quantity", { quantity: "12abc" }, "quantity"],
    ["empty quantity", { quantity: "" }, "quantity"],
    ["missing quantity", { quantity: undefined }, "quantity"],
    ["negative price", { unitPrice: -5 }, "unitPrice"],
    ["text price", { unitPrice: "abc" }, "unitPrice"],
    ["missing price", { unitPrice: undefined }, "unitPrice"],
    ["negative GST rate", { gstRate: -10 }, "gstRate"],
    ["text GST rate", { gstRate: "ten" }, "gstRate"],
  ])("rejects a %s and names the line and field", (_l, patch, field) => {
    expect(findInvalidMoneyLine([good, { ...good, ...patch }])).toEqual({
      index: 1,
      field,
      message: expect.stringContaining("Line item 2"),
    });
  });

  it("rejects a non-object line", () => {
    expect(findInvalidMoneyLine([null])).toMatchObject({ index: 0, field: "quantity" });
  });

  it("allows a negative price only when allowNegativePrice is set (variations)", () => {
    const credit = [{ ...good, unitPrice: -500 }];
    expect(findInvalidMoneyLine(credit)).toMatchObject({ field: "unitPrice" });
    expect(findInvalidMoneyLine(credit, { allowNegativePrice: true })).toBeNull();
    // Still finite, and quantity is still non-negative.
    expect(
      findInvalidMoneyLine([{ ...good, unitPrice: "abc" }], { allowNegativePrice: true }),
    ).toMatchObject({ field: "unitPrice" });
    expect(
      findInvalidMoneyLine([{ ...good, quantity: -1 }], { allowNegativePrice: true }),
    ).toMatchObject({ field: "quantity" });
  });
});
