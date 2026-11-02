"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseCheckoutReply } from "@/lib/billing/checkout-return";
import type { CheckoutReply } from "@/lib/billing/checkout-return";
import { TECHNICIAN_SEATS_ADDON } from "@/lib/billing/technician-seats-addon";

const NETWORK_MESSAGE = "Could not reach the server. Please try again.";

const SEAT_REQUEST = {
  url: "/api/addons/checkout",
  body: {
    addonKey: TECHNICIAN_SEATS_ADDON.sku,
    quantity: 1,
    returnTo: "team-invite",
  },
};
const PLAN_REQUEST = {
  url: "/api/create-checkout-session",
  body: { plan: "monthly", returnTo: "team-invite" },
};

type Props = {
  /** Owner on the web. A manager or the iOS shell sees no price and no purchase. */
  audience: "owner" | "manager" | "ios";
  headline?: string;
  /** Runs before the page can leave for Stripe, so the entry survives the trip. */
  onBeforeBuy: () => void;
  /** A seat was added without leaving the page. */
  onSeatAdded: () => void;
};

export function SeatLimitPanel({
  audience,
  headline = "All your technician seats are in use. Your entry is saved.",
  onBeforeBuy,
  onSeatAdded,
}: Props) {
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [portal, setPortal] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  // One key per click. Only a lost response keeps it, so the retry replays the
  // same purchase instead of buying a second seat.
  const lostKeys = useRef(new Map<string, string>());

  // Back from Stripe restores this page from the browser cache, button disabled.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setBuying(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function send(request: typeof SEAT_REQUEST | typeof PLAN_REQUEST) {
    const key = lostKeys.current.get(request.url) ?? globalThis.crypto.randomUUID();
    lostKeys.current.set(request.url, key);
    const res = await fetch(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(request.body),
    });
    lostKeys.current.delete(request.url);
    return parseCheckoutReply(res.status, await res.json().catch(() => ({})));
  }

  /** Returns true when the page is on its way to Stripe. */
  function settle(reply: CheckoutReply): boolean {
    switch (reply.kind) {
      case "redirect":
        window.location.assign(reply.url);
        return true;
      case "updated":
        onSeatAdded();
        return false;
      case "unpaidInvoice":
        setBlocked(true);
        setMessage(reply.message);
        return false;
      case "portalRequired":
        setBlocked(true);
        setMessage(reply.message);
        setPortal(reply.url);
        return false;
      case "needsPlan":
        setMessage("Your plan could not be confirmed. Please try again.");
        return false;
      case "refused":
        setMessage(reply.message);
        return false;
    }
  }

  async function buySeat() {
    setBuying(true);
    setMessage(null);
    onBeforeBuy();
    let leaving = false;
    try {
      let reply = await send(SEAT_REQUEST);
      if (reply.kind === "needsPlan") {
        reply = await send(PLAN_REQUEST);
        // Stripe says a plan exists but this app missed it. Catch up once, so a
        // late webhook doesn't send a paying owner to the billing portal.
        if (reply.kind === "portalRequired") {
          await fetch("/api/subscription?refresh=true");
          reply = await send(SEAT_REQUEST);
          if (reply.kind === "needsPlan") reply = await send(PLAN_REQUEST);
        }
      }
      leaving = settle(reply);
    } catch {
      setMessage(NETWORK_MESSAGE);
    } finally {
      if (!leaving) setBuying(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Technician seat needed"
      className="mt-4 space-y-3 rounded-lg border border-neutral-300 bg-white p-4 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
    >
      <p>{headline}</p>
      {audience === "manager" && (
        <p>Ask your business owner to add a technician seat, then send this again.</p>
      )}
      {audience === "owner" && !blocked && (
        <>
          <p>
            Add a seat for ${TECHNICIAN_SEATS_ADDON.amount} per month, GST
            inclusive. If a technician is on your free trial seat, this replaces
            it, so Stripe shows one seat for each technician.
          </p>
          <Button type="button" onClick={buySeat} disabled={buying}>
            Buy a seat
          </Button>
        </>
      )}
      {message && <p role="alert">{message}</p>}
      {portal && (
        <a href={portal} className="underline">
          Open the billing portal
        </a>
      )}
    </div>
  );
}
