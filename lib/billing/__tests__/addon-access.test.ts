import { describe, it, expect } from "vitest";
import {
  addonAccess,
  addonFeatureLive,
  holdingFor,
  COMING_SOON_REASON,
  OWNER_ONLY_REASON,
  TRIAL_PACK_REASON,
  type AddonViewer,
} from "../addon-access";
import { COMPLIMENTARY_PRICE_ID } from "../founding-trial-grant";

const NOW = Date.UTC(2026, 10, 19);
const IN_TEN_DAYS = new Date(NOW + 10 * 24 * 60 * 60 * 1000);
const TEN_DAYS_AGO = new Date(NOW - 10 * 24 * 60 * 60 * 1000);

const owner = (over: Partial<AddonViewer> = {}): AddonViewer => ({
  isBillingOwner: true,
  role: "ADMIN",
  subscriptionStatus: "ACTIVE",
  trialEndsAt: null,
  ...over,
});

describe("holdingFor", () => {
  it("reads the entitlement row, not pricing copy", () => {
    expect(holdingFor(null)).toBe("none");
    expect(
      holdingFor({ stripePriceId: COMPLIMENTARY_PRICE_ID, stripeSubscriptionId: null }),
    ).toBe("complimentary");
    expect(holdingFor({ stripePriceId: "price_1", stripeSubscriptionId: "sub_1" })).toBe(
      "paid",
    );
    // A grandfathered row: active, no subscription, no complimentary marker.
    expect(holdingFor({ stripePriceId: null, stripeSubscriptionId: null })).toBe(
      "included",
    );
  });
});

describe("addonAccess mirrors POST /api/addons/checkout", () => {
  const cases: Array<{
    name: string;
    perSeat: boolean;
    holding: "none" | "complimentary" | "paid" | "included";
    viewer: AddonViewer;
    featureLive?: boolean;
    label: string;
    action: string;
  }> = [
    {
      name: "active-plan owner can buy a flat pack",
      perSeat: false,
      holding: "none",
      viewer: owner(),
      label: "optional_paid",
      action: "buy",
    },
    {
      name: "current-trial owner cannot buy a flat pack (checkout 403 upgradeRequired)",
      perSeat: false,
      holding: "none",
      viewer: owner({ subscriptionStatus: "TRIAL", trialEndsAt: IN_TEN_DAYS }),
      label: "unavailable",
      action: "choose_plan",
    },
    {
      name: "current-trial owner can buy a technician seat",
      perSeat: true,
      holding: "none",
      viewer: owner({ subscriptionStatus: "TRIAL", trialEndsAt: IN_TEN_DAYS }),
      label: "optional_paid",
      action: "buy",
    },
    {
      name: "expired trial cannot buy even a seat",
      perSeat: true,
      holding: "none",
      viewer: owner({ subscriptionStatus: "TRIAL", trialEndsAt: TEN_DAYS_AGO }),
      label: "unavailable",
      action: "choose_plan",
    },
    {
      name: "lifetime status is not ACTIVE, so checkout refuses",
      perSeat: false,
      holding: "none",
      viewer: owner({ subscriptionStatus: "LIFETIME" }),
      label: "unavailable",
      action: "choose_plan",
    },
    {
      name: "a solo operator who is not ADMIN cannot buy a seat",
      perSeat: true,
      holding: "none",
      viewer: owner({ role: "USER" }),
      label: "optional_paid",
      action: "ask_owner",
    },
    {
      name: "team member is sent to the owner",
      perSeat: false,
      holding: "none",
      viewer: owner({ isBillingOwner: false, role: "MANAGER" }),
      label: "optional_paid",
      action: "ask_owner",
    },
    {
      name: "team member on a paid pack still cannot manage it",
      perSeat: false,
      holding: "paid",
      viewer: owner({ isBillingOwner: false, role: "USER" }),
      label: "optional_paid",
      action: "ask_owner",
    },
    {
      name: "owner of a paid flat pack manages it",
      perSeat: false,
      holding: "paid",
      viewer: owner(),
      label: "optional_paid",
      action: "manage",
    },
    {
      name: "owner of a paid seat pack adds a seat",
      perSeat: true,
      holding: "paid",
      viewer: owner(),
      label: "optional_paid",
      action: "add_seat",
    },
    {
      // Checkout refuses any purchase while the base plan is not ACTIVE, even
      // one more seat on an existing pack, so the card must not offer it.
      name: "owner of a paid seat pack on a past-due plan manages it, no Add a seat",
      perSeat: true,
      holding: "paid",
      viewer: owner({ subscriptionStatus: "PAST_DUE" }),
      label: "optional_paid",
      action: "manage",
    },
    {
      name: "complimentary pack has no button, even for the owner",
      perSeat: false,
      holding: "complimentary",
      viewer: owner(),
      label: "complimentary_pilot",
      action: "none",
    },
    {
      name: "complimentary seats are not sold either",
      perSeat: true,
      holding: "complimentary",
      viewer: owner({ subscriptionStatus: "TRIAL", trialEndsAt: IN_TEN_DAYS }),
      label: "complimentary_pilot",
      action: "none",
    },
    {
      name: "grandfathered pack is included",
      perSeat: false,
      holding: "included",
      viewer: owner({ isBillingOwner: false }),
      label: "included",
      action: "none",
    },
    {
      name: "a pack whose feature is off is coming soon, not for sale",
      perSeat: false,
      holding: "none",
      viewer: owner(),
      featureLive: false,
      label: "unavailable",
      action: "none",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const got = addonAccess({
        perSeat: c.perSeat,
        holding: c.holding,
        viewer: c.viewer,
        featureLive: c.featureLive,
        now: NOW,
      });
      expect(got.label).toBe(c.label);
      expect(got.action).toBe(c.action);
      expect(got.reason.length).toBeGreaterThan(0);
    });
  }

  it("says why in plain words", () => {
    expect(
      addonAccess({
        perSeat: false,
        holding: "none",
        viewer: owner({ subscriptionStatus: "TRIAL", trialEndsAt: IN_TEN_DAYS }),
        now: NOW,
      }).reason,
    ).toBe(TRIAL_PACK_REASON);
    expect(
      addonAccess({
        perSeat: false,
        holding: "none",
        viewer: owner({ isBillingOwner: false }),
        now: NOW,
      }).reason,
    ).toBe(OWNER_ONLY_REASON);
    expect(
      addonAccess({
        perSeat: false,
        holding: "none",
        viewer: owner(),
        featureLive: false,
        now: NOW,
      }).reason,
    ).toBe(COMING_SOON_REASON);
  });
});

describe("addonFeatureLive", () => {
  it("Floor Plan Underlay follows the listing-import switch, which defaults off", () => {
    const saved = process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
    delete process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
    try {
      expect(addonFeatureLive("FLOORPLAN_UNDERLAY")).toBe(false);
      process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = "true";
      expect(addonFeatureLive("FLOORPLAN_UNDERLAY")).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT;
      else process.env.NEXT_PUBLIC_UNDERLAY_URL_IMPORT = saved;
    }
  });

  it("every other pack is live", () => {
    expect(addonFeatureLive("VOICE")).toBe(true);
    expect(addonFeatureLive("TECHNICIAN_SEATS")).toBe(true);
  });
});
