import { describe, expect, it } from "vitest";
import { resolveClientRecipient } from "../client-recipient";

const a = { id: "a", email: "report@example.test" };
const b = { id: "b", email: "job@example.test" };

describe("resolveClientRecipient", () => {
  it("prefers the report's client", () => {
    expect(
      resolveClientRecipient({ reportClient: a, inspectionClient: b }),
    ).toEqual({ client: a, email: "report@example.test" });
  });

  it("falls back to the job's client when the report has none", () => {
    expect(
      resolveClientRecipient({ reportClient: null, inspectionClient: b }),
    ).toEqual({ client: b, email: "job@example.test" });
  });

  it("skips a client whose address is blank", () => {
    const blank = { id: "c", email: "   " };
    expect(
      resolveClientRecipient({ reportClient: blank, inspectionClient: b })
        ?.client,
    ).toBe(b);
  });

  it("trims the address", () => {
    expect(
      resolveClientRecipient({
        reportClient: { id: "d", email: " x@example.test " },
      })?.email,
    ).toBe("x@example.test");
  });

  it("returns null when nobody has an address", () => {
    expect(
      resolveClientRecipient({
        reportClient: { id: "e", email: null },
        inspectionClient: null,
      }),
    ).toBeNull();
  });
});
