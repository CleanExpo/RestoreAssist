import { describe, expect, it } from "vitest";
import { ok, fail, type ServiceResult } from "../result";

describe("ServiceResult", () => {
  it("ok() returns { ok: true, data }", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(42);
  });

  it("fail() returns { ok: false, reason } with optional detail + retryAfterMs", () => {
    const r = fail("RATE_LIMITED", { detail: "Xero", retryAfterMs: 30000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.detail).toBe("Xero");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("narrows correctly via discriminant", () => {
    const r: ServiceResult<number, "NOT_FOUND"> = ok(7);
    if (r.ok) {
      const n: number = r.data;
      expect(n).toBe(7);
    } else {
      const _: "NOT_FOUND" = r.reason;
    }
  });
});
