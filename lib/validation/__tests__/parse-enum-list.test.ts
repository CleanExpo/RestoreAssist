import { describe, expect, it } from "vitest";
import { enumEqualityOrIn, parseEnumList } from "../parse-enum-list";

const ALLOWED = ["DRAFT", "SENT", "PAID"] as const;

describe("parseEnumList", () => {
  it("accepts a single allowed value", () => {
    expect(parseEnumList("SENT", ALLOWED)).toEqual({
      ok: true,
      values: ["SENT"],
    });
  });

  it("splits a comma-joined list and upper-cases tokens", () => {
    expect(parseEnumList("sent, PAID", ALLOWED)).toEqual({
      ok: true,
      values: ["SENT", "PAID"],
    });
  });

  it("rejects an unknown token", () => {
    expect(parseEnumList("SENT,NOPE", ALLOWED)).toEqual({
      ok: false,
      invalid: "NOPE",
    });
  });

  it("rejects a value that is only commas or whitespace", () => {
    expect(parseEnumList(" , , ", ALLOWED)).toEqual({
      ok: false,
      invalid: " , , ",
    });
  });

  it("drops duplicates after normalisation", () => {
    expect(parseEnumList("SENT,sent,PAID", ALLOWED)).toEqual({
      ok: true,
      values: ["SENT", "PAID"],
    });
  });
});

describe("enumEqualityOrIn", () => {
  it("returns the value itself when there is one", () => {
    expect(enumEqualityOrIn(["SENT"])).toBe("SENT");
  });

  it("returns { in } when there are several", () => {
    expect(enumEqualityOrIn(["SENT", "PAID"])).toEqual({
      in: ["SENT", "PAID"],
    });
  });
});
