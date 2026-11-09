"use client";

/**
 * RA-8271 — the Field Add-Ons deck: every optional pack shown as a playing
 * card. Used by the setup wizard's Field Add-Ons step and by the Field
 * Add-Ons page, so a pack looks and behaves the same in both places.
 *
 * Prices, names and descriptions come from GET /api/addons/catalog, which
 * reads the billing registry. Nothing about a pack is typed here except its
 * card mark. Buying goes through POST /api/addons/checkout, and every reply is
 * read by the shared `parseCheckoutReply`, so a refusal shows the server's
 * reason instead of a guess.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseCheckoutReply } from "@/lib/billing/checkout-return";

export interface CatalogAddon {
  sku: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: "month" | "year";
  perSeat: boolean;
}

interface CatalogResponse {
  addons: CatalogAddon[];
  owned: string[];
  technicianSeats?: { purchased: number; used: number } | null;
}

/** Where an owner chooses or manages the plan. Reachable during setup too. */
export const PLAN_PAGE_HREF = "/dashboard/subscription";

/**
 * Shown when checkout refuses because the plan is not active yet (for example
 * on the free trial). Plain words, and it says what to do next.
 */
export const PLAN_REQUIRED_MESSAGE =
  "Packs start once your plan is active. Choose a plan, then add this pack from Field Add-Ons in the side panel.";

/**
 * Geometric card marks. Every character sits outside the ranges
 * scripts/check-no-emoji.mjs rejects (U+2600-27BF, U+2B00-2BFF and the
 * emoji planes).
 */
const CARD_MARKS: Record<string, string> = {
  VOICE: "◈",
  BOOKKEEPING: "◇",
  PAYMENTS: "▭",
  CLIENT_COMMS: "◉",
  FLOORPLAN_UNDERLAY: "▣",
  SERVICE_CRM: "⌸",
  TECHNICIAN_SEATS: "⊕",
  CLIENT_EDUCATION: "◎",
  AI_COPILOT: "◬",
};

export function cardMark(sku: string, name: string): string {
  return CARD_MARKS[sku] ?? (name.trim().charAt(0).toUpperCase() || "A");
}

function formatPrice(addon: CatalogAddon): string {
  // The packs are billed in the registry's currency (AUD today), so the
  // amount is shown in that currency rather than the viewer's.
  const money = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: addon.currency,
  }).format(addon.amount);
  const period = addon.interval === "year" ? "a year" : "a month";
  return addon.perSeat ? `${money} ${period} per seat` : `${money} ${period}`;
}

type CardNotice = { text: string; link?: { href: string; label: string } };

export interface AddonCardDeckProps {
  className?: string;
}

export function AddonCardDeck({ className }: AddonCardDeckProps) {
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [seats, setSeats] = useState<CatalogResponse["technicianSeats"]>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, CardNotice>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/addons/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalog"))))
      .then((data: CatalogResponse) => {
        if (!active) return;
        setAddons(data.addons ?? []);
        setOwned(new Set(data.owned ?? []));
        setSeats(data.technicianSeats ?? null);
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function setNotice(sku: string, notice: CardNotice) {
    setNotices((prev) => ({ ...prev, [sku]: notice }));
  }

  async function handleAdd(sku: string) {
    setBuying(sku);
    setNotices((prev) => {
      const next = { ...prev };
      delete next[sku];
      return next;
    });
    try {
      const res = await fetch("/api/addons/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // One key per click: a retried request replays, never buys twice.
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ addonKey: sku }),
      });
      const json = await res.json().catch(() => null);
      const reply = parseCheckoutReply(res.status, json);
      switch (reply.kind) {
        case "redirect":
          window.location.href = reply.url;
          return;
        case "updated":
          // An extra seat on an active seat pack is added in place.
          setSeats((prev) => ({ purchased: reply.seats, used: prev?.used ?? 0 }));
          setNotice(sku, {
            text: `Seat added. You now have ${reply.seats} field technician seat${reply.seats === 1 ? "" : "s"}.`,
          });
          break;
        case "needsPlan":
          setNotice(sku, {
            text: PLAN_REQUIRED_MESSAGE,
            link: { href: PLAN_PAGE_HREF, label: "Choose a plan" },
          });
          break;
        case "portalRequired":
          setNotice(sku, {
            text: reply.message,
            link: reply.url
              ? { href: reply.url, label: "Open billing" }
              : undefined,
          });
          break;
        case "unpaidInvoice":
        case "refused":
          setNotice(sku, { text: reply.message });
          break;
      }
    } catch {
      setNotice(sku, {
        text: "No connection, so nothing was bought. Check your connection and try again.",
      });
    }
    setBuying(null);
  }

  if (loading) {
    return (
      <div
        className={cn("grid grid-cols-[repeat(auto-fill,minmax(15rem,17rem))] justify-center gap-5", className)}
        aria-busy="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[5/7] animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/5"
          />
        ))}
        <p className="sr-only">Loading Field Add-Ons</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <p role="alert" className="py-6 text-center text-sm text-destructive">
        Couldn&apos;t load the Field Add-Ons. Please try again shortly.
      </p>
    );
  }

  return (
    <ul
      className={cn(
        // Upright cards of a fixed playing-card width, dealt left to right and
        // centred, rather than columns that stretch into wide rectangles.
        "grid grid-cols-[repeat(auto-fill,minmax(15rem,17rem))] justify-center gap-5",
        className,
      )}
      aria-label="Field Add-Ons"
    >
      {addons.map((addon) => {
        const isOwned = owned.has(addon.sku);
        const mark = cardMark(addon.sku, addon.name);
        const seatUse = addon.perSeat ? seats : null;
        const notice = notices[addon.sku];
        const busy = buying === addon.sku;
        return (
          <li key={addon.sku} data-testid={`addon-card-${addon.sku}`}>
            <article
              aria-label={addon.name}
              className={cn(
                "relative flex h-full min-h-[23.8rem] flex-col rounded-2xl border bg-white p-4 shadow-[0_1px_0_rgba(28,46,71,0.06),0_8px_24px_-12px_rgba(28,46,71,0.35)]",
                "transition-transform duration-200 motion-safe:hover:-translate-y-1 focus-within:ring-2 focus-within:ring-brand-navy/35",
                "dark:bg-slate-900",
                isOwned
                  ? "border-success/40 ring-1 ring-success/25"
                  : "border-brand-navy/15",
              )}
            >
              {/* Corner index, top left, as on a playing card. */}
              <span
                aria-hidden
                className="absolute left-3 top-3 flex flex-col items-center text-sm font-semibold leading-none text-brand-navy dark:text-slate-100"
              >
                {mark}
              </span>
              {/* Corner index, bottom right, upside down. */}
              <span
                aria-hidden
                className="absolute bottom-3 right-3 rotate-180 text-sm font-semibold leading-none text-brand-navy dark:text-slate-100"
              >
                {mark}
              </span>

              <div className="mx-3 mt-4 flex flex-1 flex-col items-center rounded-xl border border-brand-bronze/25 px-3 pb-3 pt-5 text-center">
                <span
                  aria-hidden
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-navy text-3xl leading-none text-white ring-2 ring-brand-gold/50"
                >
                  {mark}
                </span>
                <h3 className="mt-4 text-base font-semibold leading-snug text-brand-navy dark:text-slate-100">
                  {addon.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {addon.description}
                </p>
                <p className="mt-auto pt-4 text-sm font-semibold tabular-nums text-brand-navy dark:text-slate-100">
                  {formatPrice(addon)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {addon.currency}, GST inclusive
                </p>
                {seatUse ? (
                  <p className="mt-1 text-xs font-medium text-brand-navy dark:text-slate-100">
                    {seatUse.used} of {seatUse.purchased} seat
                    {seatUse.purchased === 1 ? "" : "s"} in use
                  </p>
                ) : null}
              </div>

              <div className="mx-3 mt-3 mb-5">
                {isOwned && !addon.perSeat ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-success-subtle px-2.5 py-1 text-xs font-semibold text-success-subtle-foreground ring-1 ring-success/20">
                      Active
                    </span>
                    <Link
                      href={PLAN_PAGE_HREF}
                      className="text-sm font-medium text-brand-navy underline underline-offset-4 dark:text-slate-100"
                    >
                      Manage
                    </Link>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAdd(addon.sku)}
                    disabled={busy}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-navy px-4 text-sm font-medium text-white hover:bg-brand-navy-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bronze disabled:opacity-60"
                  >
                    {busy
                      ? "Please wait"
                      : isOwned && addon.perSeat
                        ? "Add a seat"
                        : "Add pack"}
                  </button>
                )}
                {notice ? (
                  <p role="status" className="mt-2 text-xs leading-relaxed text-brand-navy dark:text-slate-100">
                    {notice.text}{" "}
                    {notice.link ? (
                      <Link
                        href={notice.link.href}
                        className="font-semibold underline underline-offset-4"
                      >
                        {notice.link.label}
                      </Link>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
