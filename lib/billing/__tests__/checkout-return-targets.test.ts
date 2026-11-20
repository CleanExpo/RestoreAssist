import { describe, it, expect } from "vitest";
import {
  ADDON_DONE_DEFAULT_PATH,
  addonDonePath,
  parseAddonCheckoutReturn,
  parseCheckoutReturn,
  seatReturnUrls,
} from "../checkout-return";
import { CHECKOUT_CANCEL_PATH } from "../checkout-presentation";

const BASE = "https://app.example.test";

describe("RA-8466: add-on checkout returns to where it started", () => {
  it("accepts setup and Field Add-Ons for add-ons only; the plan list is unchanged", () => {
    expect(parseAddonCheckoutReturn("setup")).toEqual({ ok: true, target: "setup" });
    expect(parseAddonCheckoutReturn("addons")).toEqual({ ok: true, target: "addons" });
    expect(parseAddonCheckoutReturn("team-invite")).toEqual({
      ok: true,
      target: "team-invite",
    });
    expect(parseAddonCheckoutReturn(undefined)).toEqual({ ok: true });
    expect(parseAddonCheckoutReturn("https://evil.example")).toEqual({ ok: false });
    expect(parseAddonCheckoutReturn("/setup")).toEqual({ ok: false });
    expect(parseCheckoutReturn("setup")).toEqual({ ok: false });
  });

  it("cancelling from setup lands back on setup, not the upgrade page", () => {
    const urls = seatReturnUrls(BASE, "VOICE", "setup");
    expect(urls.cancelUrl).toBe(`${BASE}/setup?checkout=cancelled`);
    expect(urls.successUrl).toBe(
      `${BASE}/dashboard/success?addon=VOICE&next=setup&session_id={CHECKOUT_SESSION_ID}`,
    );
  });

  it("cancelling from Field Add-Ons lands back on Field Add-Ons", () => {
    const urls = seatReturnUrls(BASE, "VOICE", "addons");
    expect(urls.cancelUrl).toBe(`${BASE}/dashboard/addons?checkout=cancelled`);
    expect(urls.successUrl).toContain("&next=addons&");
  });

  it("no target keeps today's URLs", () => {
    const urls = seatReturnUrls(BASE, "VOICE", undefined);
    expect(urls.cancelUrl).toBe(`${BASE}${CHECKOUT_CANCEL_PATH}`);
    expect(urls.successUrl).not.toContain("next=");
  });

  it("the success page sends a confirmed purchase back to its start", () => {
    expect(addonDonePath("setup")).toBe("/setup?checkout=done");
    expect(addonDonePath("addons")).toBe("/dashboard/addons?checkout=done");
    expect(addonDonePath(null)).toBe(ADDON_DONE_DEFAULT_PATH);
    expect(addonDonePath("team-invite")).toBe(ADDON_DONE_DEFAULT_PATH);
    expect(addonDonePath("//evil.example")).toBe(ADDON_DONE_DEFAULT_PATH);
  });
});
