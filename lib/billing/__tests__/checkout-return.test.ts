import { describe, expect, it } from "vitest";
import {
  parseCheckoutReply,
  parseCheckoutReturn,
  planReturnUrls,
  seatReturnUrls,
} from "../checkout-return";
import { CHECKOUT_CANCEL_PATH } from "../checkout-presentation";

const BASE = "https://app.test";

describe("parseCheckoutReturn", () => {
  it("accepts the one known target", () => {
    expect(parseCheckoutReturn("team-invite")).toEqual({
      ok: true,
      target: "team-invite",
    });
  });

  it("treats an absent value as no target", () => {
    expect(parseCheckoutReturn(undefined)).toEqual({ ok: true });
  });

  it.each(["https://evil.test", "//evil.test", "/dashboard", "", 1, null, {}])(
    "refuses %j",
    (value) => {
      expect(parseCheckoutReturn(value).ok).toBe(false);
    },
  );
});

describe("return URLs", () => {
  it("sends a seat return through the success page with a fixed next target", () => {
    const urls = seatReturnUrls(BASE, "TECHNICIAN_SEATS", "team-invite");
    expect(urls.successUrl).toBe(
      `${BASE}/dashboard/success?addon=TECHNICIAN_SEATS&next=team-invite&session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(urls.cancelUrl).toBe(
      `${BASE}/dashboard/team?invite=1&checkout=cancelled`,
    );
  });

  it("sends a plan return through the success page with a fixed next target", () => {
    const urls = planReturnUrls(BASE, "team-invite");
    expect(urls.successUrl).toBe(
      `${BASE}/dashboard/success?next=team-invite&session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(urls.cancelUrl).toBe(
      `${BASE}/dashboard/team?invite=1&checkout=cancelled`,
    );
  });

  it("keeps today's URLs when no target is set", () => {
    expect(seatReturnUrls(BASE, "TECHNICIAN_SEATS", undefined)).toEqual({
      successUrl: `${BASE}/dashboard/success?addon=TECHNICIAN_SEATS&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${BASE}${CHECKOUT_CANCEL_PATH}`,
    });
    expect(planReturnUrls(BASE, undefined)).toEqual({
      successUrl: `${BASE}/dashboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${BASE}${CHECKOUT_CANCEL_PATH}`,
    });
  });
});

describe("parseCheckoutReply", () => {
  it("redirect", () => {
    expect(
      parseCheckoutReply(200, { sessionId: "cs", url: "https://stripe.test/x" }),
    ).toEqual({ kind: "redirect", url: "https://stripe.test/x" });
  });

  it("updated in place", () => {
    expect(parseCheckoutReply(200, { updated: true, seats: 3 })).toEqual({
      kind: "updated",
      seats: 3,
    });
  });

  it("needs the plan first, from the flat string envelope", () => {
    expect(
      parseCheckoutReply(403, { error: "x", upgradeRequired: true }),
    ).toEqual({ kind: "needsPlan" });
  });

  it("unpaid invoice is its own state, from the nested envelope", () => {
    expect(
      parseCheckoutReply(402, {
        error: { code: "PAYMENT_REQUIRED", message: "unpaid invoice" },
      }),
    ).toEqual({ kind: "unpaidInvoice", message: "unpaid invoice" });
  });

  it("portal required keeps a null url", () => {
    expect(
      parseCheckoutReply(409, {
        error: "already active",
        portalRequired: true,
        url: null,
      }),
    ).toEqual({ kind: "portalRequired", message: "already active", url: null });
  });

  it.each([
    [403, { error: { code: "FORBIDDEN", message: "ask your owner" } }, "ask your owner"],
    [409, { error: { code: "CONFLICT", message: "included free" } }, "included free"],
    [404, { error: { code: "NOT_FOUND", message: "no workspace" } }, "no workspace"],
  ])("refused %i shows the server's message", (status, json, message) => {
    expect(parseCheckoutReply(status, json)).toEqual({
      kind: "refused",
      message,
    });
  });

  it("a 200 with no usable url is refused, never a redirect to undefined", () => {
    expect(parseCheckoutReply(200, { sessionId: "cs" }).kind).toBe("refused");
  });
});
