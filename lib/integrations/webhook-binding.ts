/**
 * RA-8446 slice 2: bind one accounting webhook event to the one connection
 * the readiness owner (getOAuthReadiness) calls ready.
 *
 * Accounting webhooks name an organisation (Xero tenantId, QuickBooks realmId,
 * MYOB company file). The ingest routes used to bind to the row whose raw
 * status was CONNECTED. They now ask the owner, so a SYNCING or ERROR row that
 * is ready receives its events, and a CONNECTED row with no organisation or no
 * stored credentials does not.
 *
 * Decision (RA-8446): an event aimed only at rows the owner calls not ready is
 * NOT stored. The WebhookEvent store has no "received, held" status: PENDING
 * rows are taken by the drains straight away, and SKIPPED at ingest is
 * reserved per event type by lib/integrations/webhook-event-types.ts (its
 * guard test fails if a drained type can be stored SKIPPED). The route logs
 * the reason and acknowledges the event, the same as an unknown organisation.
 */
import { getOAuthReadiness, isOAuthIntegration, type IntegrationIdentityInput, type OAuthProvider, type OAuthReadiness } from "./identity";

/** Rows past this many are refused rather than filtered; a cap must not hide an owner. */
export const MAX_WEBHOOK_CANDIDATES = 100;

export type NotReadyReason = Extract<OAuthReadiness, { ready: false }>["reason"];

export type WebhookBindingResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "UNKNOWN_ORGANISATION" | "AMBIGUOUS" }
  | { ok: false; reason: "NOT_READY"; detail: NotReadyReason };

export async function resolveReadyWebhookIntegration<T extends IntegrationIdentityInput & { id: string }>(input: {
  provider: OAuthProvider;
  /** Rows read with at most MAX_WEBHOOK_CANDIDATES + 1 as the take. */
  rows: readonly T[];
  /** Does this row belong to the event's organisation? */
  matches: (row: T) => boolean;
  /** SQL presence test for credentials (credentialPresentIds). */
  credentialPresentIds: (ids: string[]) => Promise<Set<string>>;
}): Promise<WebhookBindingResult<T>> {
  if (input.rows.length > MAX_WEBHOOK_CANDIDATES) return { ok: false, reason: "AMBIGUOUS" };
  const matched = input.rows.filter(row => isOAuthIntegration(row, input.provider) && input.matches(row));
  if (matched.length === 0) return { ok: false, reason: "UNKNOWN_ORGANISATION" };
  const present = await input.credentialPresentIds(matched.map(row => row.id));
  const verdicts = matched.map(row => ({
    row, readiness: getOAuthReadiness({ ...row, hasOAuthCredentials: present.has(row.id) }, input.provider),
  }));
  const ready = verdicts.filter(v => v.readiness.ready);
  if (ready.length > 1) return { ok: false, reason: "AMBIGUOUS" };
  if (ready.length === 1) return { ok: true, data: ready[0].row };
  const first = verdicts[0].readiness;
  return { ok: false, reason: "NOT_READY", detail: first.ready ? "INVALID_IDENTITY" : first.reason };
}
