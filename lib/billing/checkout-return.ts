/**
 * Where a Stripe Checkout returns the buyer, and how a checkout reply reads.
 *
 * `returnTo` is a closed list mapped to fixed paths here, so a client can never
 * name a URL. Both legs land on /dashboard/success, which runs the verify, so a
 * purchase is confirmed before the invite opens.
 */

import { CHECKOUT_CANCEL_PATH } from "@/lib/billing/checkout-presentation";

export type CheckoutReturnTarget = "team-invite";

/**
 * RA-8466: an add-on bought from the setup wizard or the Field Add-Ons page
 * returns there, paid or cancelled, instead of leaving setup for the
 * Subscription page (RA-8272 item 3). Add-on checkout only; the plan
 * checkout keeps its own closed list above.
 */
export type AddonCheckoutReturnTarget = CheckoutReturnTarget | "setup" | "addons";

const TEAM_INVITE_CANCEL_PATH = "/dashboard/team?invite=1&checkout=cancelled";

const ADDON_CANCEL_PATHS: Record<AddonCheckoutReturnTarget, string> = {
  "team-invite": TEAM_INVITE_CANCEL_PATH,
  setup: "/setup?checkout=cancelled",
  addons: "/dashboard/addons?checkout=cancelled",
};

/** Where the success page sends the buyer once an add-on is confirmed. */
const ADDON_DONE_PATHS: Record<"setup" | "addons", string> = {
  setup: "/setup?checkout=done",
  addons: "/dashboard/addons?checkout=done",
};

/** Today's destination after an add-on purchase, kept for every other caller. */
export const ADDON_DONE_DEFAULT_PATH = "/dashboard/subscription?addon=success";

/** Absent is fine and keeps today's URLs; anything unknown is refused. */
export function parseCheckoutReturn(
  value: unknown,
): { ok: boolean; target?: CheckoutReturnTarget } {
  if (value === undefined) return { ok: true };
  if (value === "team-invite") return { ok: true, target: value };
  return { ok: false };
}

/** The add-on checkout's closed list: the plan list plus setup and Field Add-Ons. */
export function parseAddonCheckoutReturn(
  value: unknown,
): { ok: boolean; target?: AddonCheckoutReturnTarget } {
  if (value === undefined) return { ok: true };
  if (value === "team-invite" || value === "setup" || value === "addons") {
    return { ok: true, target: value };
  }
  return { ok: false };
}

/**
 * The success page's `next` value mapped to a fixed path. Anything else,
 * including a missing or unknown value, keeps today's Subscription page.
 */
export function addonDonePath(next: string | null | undefined): string {
  if (next === "setup" || next === "addons") return ADDON_DONE_PATHS[next];
  return ADDON_DONE_DEFAULT_PATH;
}

export function seatReturnUrls(
  baseUrl: string,
  addonKey: string,
  target: AddonCheckoutReturnTarget | undefined,
): { successUrl: string; cancelUrl: string } {
  const next = target ? `&next=${target}` : "";
  return {
    successUrl: `${baseUrl}/dashboard/success?addon=${addonKey}${next}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}${target ? ADDON_CANCEL_PATHS[target] : CHECKOUT_CANCEL_PATH}`,
  };
}

export function planReturnUrls(
  baseUrl: string,
  target: CheckoutReturnTarget | undefined,
): { successUrl: string; cancelUrl: string } {
  const next = target ? `next=${target}&` : "";
  return {
    successUrl: `${baseUrl}/dashboard/success?${next}session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}${target ? TEAM_INVITE_CANCEL_PATH : CHECKOUT_CANCEL_PATH}`,
  };
}

export type CheckoutReply =
  | { kind: "redirect"; url: string }
  | { kind: "updated"; seats: number }
  | { kind: "needsPlan" }
  | { kind: "unpaidInvoice"; message: string }
  | { kind: "portalRequired"; message: string; url: string | null }
  | { kind: "refused"; message: string };

const FALLBACK_MESSAGE = "Couldn't complete that. Please try again.";

// The checkout routes answer with two envelopes: a flat { error: string } and
// apiError's { error: { code, message } }.
function errorMessage(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return FALLBACK_MESSAGE;
}

/** Reads a reply from either checkout route. Decides from the server's answer only. */
export function parseCheckoutReply(
  status: number,
  json: unknown,
): CheckoutReply {
  const payload =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  if (status >= 200 && status < 300) {
    if (payload.updated === true && typeof payload.seats === "number") {
      return { kind: "updated", seats: payload.seats };
    }
    if (typeof payload.url === "string" && payload.url) {
      return { kind: "redirect", url: payload.url };
    }
    return { kind: "refused", message: FALLBACK_MESSAGE };
  }
  if (status === 403 && payload.upgradeRequired === true) {
    return { kind: "needsPlan" };
  }
  if (status === 409 && payload.portalRequired === true) {
    return {
      kind: "portalRequired",
      message: errorMessage(payload),
      url: typeof payload.url === "string" ? payload.url : null,
    };
  }
  if (status === 402) {
    return { kind: "unpaidInvoice", message: errorMessage(payload) };
  }
  return { kind: "refused", message: errorMessage(payload) };
}

/*
 * RA-8272: moved here from components/addons/AddonCardDeck.tsx so every
 * checkout caller releases its Idempotency-Key by the same rule.
 */
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
