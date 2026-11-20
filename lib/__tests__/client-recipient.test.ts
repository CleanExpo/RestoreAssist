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

  it("never sends to the job's client when the report's client has no address", () => {
    for (const email of ["   ", "", null]) {
      expect(
        resolveClientRecipient({
          reportClient: { id: "c", email },
          inspectionClient: b,
        }),
      ).toBeNull();
    }
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
