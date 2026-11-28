"use client";

/**
 * RA-8665 (founder, 28/11/2026): "they should be right up at the top with
 * buttons for the clients to add those add-on services". The dashboard home
 * shows the packs near the top, in Simple and Advanced alike, using the same
 * card deck as the Add-Ons page, so the owner rules, prices and checkout are
 * the deck's own: the owner sees Add, staff see who to ask, owned packs show
 * as on.
 *
 * The whole section is a purchase surface, so it sits inside BillingGate and
 * shows nothing in the iOS app (App Review 3.1.1).
 *
 * This file decides nothing about billing. The intro line follows the server's
 * canManageBilling (read by the deck), and the "See all add-ons" link follows
 * the Add-Ons tab's own rule (fieldAddonsTabVisible), so it shows only to the
 * people that page lets in.
 */

import Link from "next/link";
import { useSession } from "next-auth/react";
import BillingGate from "@/components/capacitor/BillingGate";
import { fieldAddonsTabVisible } from "@/app/dashboard/nav-config";
import { OWNER_ONLY_REASON } from "@/lib/billing/addon-access";
import { ADDON_PRICE_TERMS, AddonCardDeck } from "./AddonCardDeck";

/** RA-8665: the owner reads the offer and its terms. */
export const HOME_ADDONS_OWNER_INTRO = `Switch on extra features for your business. ${ADDON_PRICE_TERMS}`;

/** RA-8665: staff read who can add packs, not an offer they cannot take. */
export const HOME_ADDONS_STAFF_INTRO = `These packs add extra features to RestoreAssist. ${OWNER_ONLY_REASON}`;

export function HomeAddons() {
  // Inside BillingGate, so billing navigation is not hidden here.
  const showPageLink = fieldAddonsTabVisible({
    role: useSession().data?.user?.role,
    hideBillingNav: false,
  });
  return (
    <BillingGate fallback={null}>
      <section aria-labelledby="home-addons-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="home-addons-heading"
            className="text-lg font-semibold text-brand-navy dark:text-slate-100"
          >
            Add-Ons
          </h2>
          {/* The Add-Ons page is owner-only; staff would be turned away. */}
          {showPageLink && (
            <Link
              href="/dashboard/addons"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              See all add-ons
            </Link>
          )}
        </div>
        <AddonCardDeck
          returnTo="addons"
          intro={{ owner: HOME_ADDONS_OWNER_INTRO, staff: HOME_ADDONS_STAFF_INTRO }}
        />
      </section>
    </BillingGate>
  );
}
