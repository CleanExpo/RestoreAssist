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

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  parseCheckoutReply,
  type CheckoutReply,
} from "@/lib/billing/checkout-return";
import BillingGate from "@/components/capacitor/BillingGate";

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
 * Shown when the request may have reached the server but no answer came back
 * (connection dropped), or the server says the same request is still being
 * worked on. The purchase may or may not have happened, so this never says
 * "nothing was bought". Pressing again resends the SAME Idempotency-Key, which
 * the server answers with the first request's result instead of buying twice.
 */
export const PURCHASE_UNCONFIRMED_MESSAGE =
  "We couldn't confirm whether this went through. Wait a moment, then press the button again to check. It will not charge you twice.";

/**
 * What the iOS app shows instead of the deck (App Review 3.1.1): no prices,
 * no buttons and no links to an outside purchase.
 */
export const IOS_ADDONS_MESSAGE =
  "Field Add-Ons are managed by your workspace administrator.";

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

/**
 * Review rounds 1 and 2: whether a checkout reply is a FINAL answer, so the
 * pack's Idempotency-Key can be released and the next press may start a new
 * purchase. Decided positively: only a reply we could read and that names an
 * outcome counts. Everything else means the purchase may or may not have
 * happened, and the key must be kept so a retry replays the first result:
 *   - no readable body (connection cut mid-reply, truncated or non-JSON body);
 *   - a server error (5xx): the work may have run before it failed;
 *   - a 409 that is not the billing-portal case: the idempotency layer saying
 *     the same request is still running or its result could not be verified;
 *   - a 2xx that names no outcome (no checkout link, no seat count).
 */
/**
 * Review round 3: the checkout route and the idempotency layer both send 409.
 * Every 409 either can send, and what it means:
 *   - route, apiError envelope `{ error: { code: "CONFLICT", message } }`:
 *     the pack is free in the Founding Trial, or another seat checkout won the
 *     race. Nothing was bought; final. (The idempotency layer caches this reply,
 *     so keeping the key would replay it for ever.)
 *   - billing-portal reply (`portalRequired: true`): final.
 *   - idempotency layer, plain-string `error`: the same request is still
 *     running, or its completion could not be verified, or the key was reused
 *     with another body. Outcome unknown; keep the key.
 */
function isRouteConflict(body: unknown): boolean {
  const error = (body as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "CONFLICT"
  );
}

/**
 * Review round 4: some refusals come from checks the route runs BEFORE it
 * looks up the Idempotency-Key (iOS block, sign-in, owner check, rate limit).
 * They refuse this press only and say nothing about an earlier press with the
 * same key. So once a key has an unknown outcome (`unresolved`), a refusal
 * settles it only when it is the server's stored reply for that key, which
 * the idempotency layer marks with `Idempotent-Replayed: true` (`replayed`).
 * Keeping a key is always safe: the server either replays the stored outcome
 * or, if nothing was stored, runs the request once.
 */
export function isFinalCheckoutAnswer(
  status: number,
  body: unknown,
  reply: CheckoutReply,
  context: { unresolved: boolean; replayed: boolean } = {
    unresolved: false,
    replayed: false,
  },
): boolean {
  if (body === null || typeof body !== "object") return false;
  if (status >= 500) return false;
  if (status >= 200 && status < 300) {
    return reply.kind === "redirect" || reply.kind === "updated";
  }
  if (
    status === 409 &&
    !(reply.kind === "portalRequired" || isRouteConflict(body))
  ) {
    return false;
  }
  if (context.unresolved && !context.replayed) return false;
  return true;
}

/**
 * Review round 5: a pack's Idempotency-Key must outlive the component. The
 * setup wizard unmounts this deck on Next/Back, and a page can reload, while
 * an earlier press's outcome is still unknown; a fresh key would let the next
 * press buy again. Keys live in localStorage per pack (an in-memory map when
 * storage is unavailable) and are cleared only on a final answer.
 *
 * Review round 8: stored per signed-in account AND pack ("slot"). The server
 * scopes every key to the user (withIdempotency(request, userId)), so each
 * account's unresolved key must survive another account using this browser;
 * a shared per-pack entry let account B's answer clear account A's key.
 * Review round 7: an entry never expires on the client. The server replays a
 * completed reply for 24 hours after completion, so dropping a key on age
 * could buy twice; once the server's record has expired, reusing the old key
 * runs the request once, exactly as a new key would. Reuse is never worse.
 *
 * Review round 6: each press stamps the entry with its own `attempt` id, and
 * a press clears the entry only while the stamp is still its own. A press
 * that outlived its deck (unmounted mid-request) can otherwise answer late
 * and clear a key that a newer, still-unresolved press with the same key
 * needs; the next press would then mint a new key and could buy again.
 */
type PendingKey = {
  key: string;
  unresolved: boolean;
  attempt: string;
  /**
   * RA-8271: the seat count sent with this key. Kept with the key because the
   * server refuses a reused key whose body differs, so every retry must send
   * the count of the first press, not a re-read one.
   */
  expectedSeats?: number;
};

const PENDING_KEY_PREFIX = "restoreassist:addon-checkout-key:";
// When a storage write or removal fails, memory is the authority for that slot
// for the rest of the page's life (review round 10): an older readable storage
// entry must not shadow it. null means "cleared here; ignore storage".
const memoryPendingKeys = new Map<string, PendingKey | null>();

function readPendingKey(slot: string): PendingKey | null {
  let entry: unknown;
  if (memoryPendingKeys.has(slot)) {
    entry = memoryPendingKeys.get(slot);
  } else {
    try {
      const raw = window.localStorage.getItem(PENDING_KEY_PREFIX + slot);
      entry = raw === null ? null : JSON.parse(raw);
    } catch {
      entry = null;
    }
  }
  const e = entry as Partial<PendingKey> | null;
  if (!e || typeof e.key !== "string") return null;
  return {
    key: e.key,
    unresolved: e.unresolved === true,
    attempt: typeof e.attempt === "string" ? e.attempt : "",
    ...(typeof e.expectedSeats === "number"
      ? { expectedSeats: e.expectedSeats }
      : {}),
  };
}

function writePendingKey(slot: string, entry: PendingKey): void {
  try {
    window.localStorage.setItem(
      PENDING_KEY_PREFIX + slot,
      JSON.stringify(entry),
    );
    memoryPendingKeys.delete(slot);
  } catch {
    memoryPendingKeys.set(slot, entry);
  }
}

function clearPendingKeyIfOwner(slot: string, attempt: string): void {
  if (readPendingKey(slot)?.attempt !== attempt) return; // a newer press owns it
  try {
    window.localStorage.removeItem(PENDING_KEY_PREFIX + slot);
    memoryPendingKeys.delete(slot);
  } catch {
    memoryPendingKeys.set(slot, null);
  }
}

type CardNotice = { text: string; link?: { href: string; label: string } };

export interface AddonCardDeckProps {
  className?: string;
}

/**
 * The deck is a purchase surface, so it carries its own BillingGate: every
 * screen that shows it (the setup step, the Field Add-Ons page, any later one)
 * hides prices and buttons in the iOS app without having to remember to.
 */
export function AddonCardDeck(props: AddonCardDeckProps) {
  return (
    <BillingGate
      fallback={
        <p
          role="status"
          className="py-6 text-center text-sm text-muted-foreground"
        >
          {IOS_ADDONS_MESSAGE}
        </p>
      }
    >
      <AddonCardDeckContent {...props} />
    </BillingGate>
  );
}

function AddonCardDeckContent({ className }: AddonCardDeckProps) {
  // Pending purchase keys are stored per account (see readPendingKey). No
  // purchase starts until the signed-in account is known.
  const accountId = useSession().data?.user?.id ?? null;
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [seats, setSeats] = useState<CatalogResponse["technicianSeats"]>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, CardNotice>>({});
  const mounted = useRef(true);

  const loadCatalog = useCallback(async (): Promise<void> => {
    const r = await fetch("/api/addons/catalog");
    if (!r.ok) throw new Error("catalog");
    const data = (await r.json()) as CatalogResponse;
    if (!mounted.current) return;
    setAddons(data.addons ?? []);
    setOwned(new Set(data.owned ?? []));
    setSeats(data.technicianSeats ?? null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadCatalog()
      .catch(() => {
        if (mounted.current) setLoadError(true);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [loadCatalog]);

  function setNotice(sku: string, notice: CardNotice) {
    setNotices((prev) => ({ ...prev, [sku]: notice }));
  }

  async function handleAdd(sku: string) {
    if (!accountId) return; // the button is disabled until the account is known
    setBuying(sku);
    setNotices((prev) => {
      const next = { ...prev };
      delete next[sku];
      return next;
    });
    // One Idempotency-Key per pack until a final answer (see readPendingKey).
    // `pending.unresolved` says whether an EARLIER press with this key ended
    // with an unknown outcome. The key is stored as unresolved before the
    // request goes out: if the page goes away mid-request, the outcome is
    // unknown.
    const attempt = crypto.randomUUID();
    const slot = `${accountId}:${sku}`;
    // A seat pack sends the seat count this page shows, so the server adds a
    // seat only to that count: a repeated press can no longer buy twice even
    // if its key was lost (RA-8271, app/api/addons/checkout).
    const seatPack = addons.find((a) => a.sku === sku)?.perSeat === true;
    const pending = readPendingKey(slot) ?? {
      key: crypto.randomUUID(),
      unresolved: false,
      attempt,
      ...(seatPack && seats ? { expectedSeats: seats.purchased } : {}),
    };
    writePendingKey(slot, { ...pending, unresolved: true, attempt });
    try {
      const res = await fetch("/api/addons/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.key,
        },
        body: JSON.stringify({
          addonKey: sku,
          ...(pending.expectedSeats !== undefined
            ? { expectedSeats: pending.expectedSeats }
            : {}),
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      const reply = parseCheckoutReply(res.status, json);
      const final = isFinalCheckoutAnswer(res.status, json, reply, {
        unresolved: pending.unresolved,
        replayed: res.headers?.get?.("Idempotent-Replayed") === "true",
      });
      if (!final) {
        // Unknown outcome: keep the key, say so, and re-read the catalog so a
        // pack that did go through shows as Active.
        setNotice(sku, { text: PURCHASE_UNCONFIRMED_MESSAGE });
        loadCatalog().catch(() => {});
        setBuying(null);
        return;
      }
      clearPendingKeyIfOwner(slot, attempt);
      switch (reply.kind) {
        case "redirect":
          window.location.href = reply.url;
          return;
        case "updated":
          // An extra seat on an active seat pack is added in place.
          setSeats((prev) => ({
            purchased: reply.seats,
            used: prev?.used ?? 0,
          }));
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
          // A refusal can mean the seat count moved: show the current one.
          loadCatalog().catch(() => {});
          break;
      }
    } catch {
      // The request may have reached the server before the connection
      // dropped. Keep the key, say the result is unknown, and re-read the
      // catalog so a pack that did go through shows as Active.
      setNotice(sku, { text: PURCHASE_UNCONFIRMED_MESSAGE });
      loadCatalog().catch(() => {});
    }
    setBuying(null);
  }

  if (loading) {
    return (
      <div
        className={cn(
          "grid grid-cols-[repeat(auto-fill,minmax(15rem,17rem))] justify-center gap-5",
          className,
        )}
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
                    disabled={busy || !accountId}
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
                  <p
                    role="status"
                    className="mt-2 text-xs leading-relaxed text-brand-navy dark:text-slate-100"
                  >
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
