/**
 * Turn a failed `POST /api/integrations/oauth/[provider]/connect` response
 * into one sentence the operator can act on, plus (where one exists) the
 * action that unblocks them.
 *
 * The setup wizard's Integrations step used to `if (res.ok)` and drop every
 * other outcome on the floor, so a click on Xero / QuickBooks / MYOB did
 * nothing at all and said nothing about why. That is not a rare edge: the
 * three bookkeeping providers are gated behind the BOOKKEEPING add-on
 * (`connect/route.ts` → `requireAddon`), so a workspace that has not bought
 * it — which is every workspace during onboarding — gets a 402 on every
 * attempt, forever, in silence.
 *
 * Four envelope shapes reach here, which is why this is not done ad hoc at
 * the call site:
 *
 *   - `requireAddon` deny (402): raw `{ error, code, sku, action, redirectUrl }`.
 *   - `createSubscriptionRequiredResponse` (403): raw
 *     `{ error, upgradeRequired, currentStatus, message }` — `message` is the
 *     operator-facing half, `error` is the terse code-ish half.
 *   - `apiError` (401 / 400 / 5xx): the RA-1548 envelope,
 *     `{ error: { code, message } }`. Passing `body.error` to React as a child
 *     throws ("Objects are not valid as a React child").
 *   - Anything else, including a body that is not JSON at all.
 *
 * The server's `redirectUrl` is deliberately NOT used as the link target.
 * `requireAddon` points at `/subscribe`, which is not a route in this app
 * (`app/subscribe` does not exist) — following it would 404 the operator. The
 * wizard picks its own destination, which also keeps the wizard's outbound
 * links and the setup gate's bypass list (`proxy.ts` SETUP_GATE_BYPASS) in
 * agreement about exactly which paths must stay reachable mid-setup.
 */

import { BOOKKEEPING_ADDON } from "@/lib/billing/bookkeeping-addon";
import { SERVICE_CRM_ADDON } from "@/lib/billing/service-crm-addon";

/** The one billing destination the wizard links to. Must stay bypassed in `proxy.ts`. */
export const SUBSCRIPTION_URL = "/dashboard/subscription";

export interface IntegrationConnectFailure {
  /** One sentence, safe to render as a React child. */
  message: string;
  /** Present only when there is somewhere useful to send the operator. */
  action?: { label: string; href: string };
}

/**
 * Operator-facing names for the add-on SKUs a connect attempt can be blocked
 * on. Sourced from each add-on's SSOT constant so the wizard and the checkout
 * never disagree about what the operator is being asked to buy.
 */
const ADDON_LABEL: Record<string, string> = {
  BOOKKEEPING: BOOKKEEPING_ADDON.name,
  SERVICE_CRM: SERVICE_CRM_ADDON.name,
};

function nestedMessage(body: unknown): string | null {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return null;
}

export function integrationConnectFailure(
  status: number,
  body: unknown,
  providerName: string,
): IntegrationConnectFailure {
  const b = body as
    | { code?: unknown; sku?: unknown; message?: unknown; upgradeRequired?: unknown }
    | null
    | undefined;

  const code = typeof b?.code === "string" ? b.code : null;

  // 402 — an add-on or a subscription stands between the operator and OAuth.
  if (code === "ADDON_REQUIRED") {
    const sku = typeof b?.sku === "string" ? b.sku : "";
    const addon = ADDON_LABEL[sku] ?? "required";
    return {
      message: `${providerName} needs the ${addon} add-on before it can connect.`,
      action: { label: "View add-ons", href: SUBSCRIPTION_URL },
    };
  }

  if (code === "NO_WORKSPACE") {
    return {
      message: `${providerName} needs an active subscription before it can connect.`,
      action: { label: "Choose a plan", href: SUBSCRIPTION_URL },
    };
  }

  // 403 — the paid-subscriber gate on all external integrations. Its `message`
  // is the sentence written for operators; `error` is the terse half.
  if (b?.upgradeRequired === true) {
    const message =
      typeof b.message === "string" && b.message.trim()
        ? b.message.trim()
        : `${providerName} is available on paid plans.`;
    return { message, action: { label: "View plans", href: SUBSCRIPTION_URL } };
  }

  if (status === 401) {
    return {
      message: `Your session expired — sign in again to connect ${providerName}.`,
    };
  }

  // 5xx is either a transient upstream fault or a deployment that has no
  // client credentials for this provider. The operator cannot tell those
  // apart and cannot fix either, so do not leak the internal reason.
  if (status >= 500) {
    return {
      message: `${providerName} isn't available right now. Try again, or connect it later from Settings.`,
    };
  }

  const nested = nestedMessage(body);
  if (nested) return { message: nested };

  return {
    message: `Couldn't connect ${providerName} (${status}). Try again, or connect it later from Settings.`,
  };
}
