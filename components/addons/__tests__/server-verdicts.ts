/**
 * RA-8665: a catalogue reply as GET /api/addons/catalog sends it, with each
 * card's verdict worked out by the real judge (addonAccess) for the viewer
 * given. Tests build their replies with it, so a card's controls always come
 * from the server's rules and never from a guess on screen.
 */
import {
  addonAccess,
  type AddonAccess,
  type AddonViewer,
} from "@/lib/billing/addon-access";

/** A business owner on an active plan, with a workspace. */
export const OWNER_VIEWER: AddonViewer = {
  isBillingOwner: true,
  role: "ADMIN",
  subscriptionStatus: "ACTIVE",
  trialEndsAt: null,
  hasWorkspace: true,
  canOpenBillingPages: true,
};

/** A team member of that business. */
export const STAFF_VIEWER: AddonViewer = {
  ...OWNER_VIEWER,
  isBillingOwner: false,
  role: "USER",
  canOpenBillingPages: false,
};

export function withServerVerdicts<
  T extends { addons: { sku: string; perSeat: boolean }[]; owned: string[] },
>(catalog: T, viewer: AddonViewer = OWNER_VIEWER) {
  const access: Record<string, AddonAccess> = {};
  for (const a of catalog.addons) {
    access[a.sku] = addonAccess({
      perSeat: a.perSeat,
      holding: catalog.owned.includes(a.sku) ? "paid" : "none",
      viewer,
      featureLive: true,
    });
  }
  // Same as the route: canManageBilling is the viewer's billing-owner flag.
  return { ...catalog, access, canManageBilling: viewer.isBillingOwner };
}
