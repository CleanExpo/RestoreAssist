/**
 * Where a Stripe Checkout returns the buyer, and how a checkout reply reads.
 *
 * `returnTo` is a closed list mapped to fixed paths here, so a client can never
 * name a URL. Both legs land on /dashboard/success, which runs the verify, so a
 * purchase is confirmed before the invite opens.
 */

import { CHECKOUT_CANCEL_PATH } from "@/lib/billing/checkout-presentation";

export type CheckoutReturnTarget = "team-invite";

const TEAM_INVITE_CANCEL_PATH = "/dashboard/team?invite=1&checkout=cancelled";

/** Absent is fine and keeps today's URLs; anything unknown is refused. */
export function parseCheckoutReturn(
  value: unknown,
): { ok: boolean; target?: CheckoutReturnTarget } {
  if (value === undefined) return { ok: true };
  if (value === "team-invite") return { ok: true, target: value };
  return { ok: false };
}

export function seatReturnUrls(
  baseUrl: string,
  addonKey: string,
  target: CheckoutReturnTarget | undefined,
): { successUrl: string; cancelUrl: string } {
  const next = target ? `&next=${target}` : "";
  return {
    successUrl: `${baseUrl}/dashboard/success?addon=${addonKey}${next}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}${target ? TEAM_INVITE_CANCEL_PATH : CHECKOUT_CANCEL_PATH}`,
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
