/**
 * RA-8427 — the one owner of webhook event types.
 *
 * Every (provider, eventType) an ingest route under app/api/webhooks may store
 * as a WebhookEvent row is listed here, with what happens to it next. The
 * drains read their accept lists from this file, and
 * lib/integrations/__tests__/webhook-event-types.test.ts scans the ingest
 * routes and fails when a route stores a type that is not listed, when a
 * listed type is no longer stored, or when a "drained" type is not accepted by
 * a drain that production actually runs (lib/cron/production-schedule.ts).
 *
 * Before this file, each route invented its type strings by hand and each
 * drain kept a private accept list, and nothing compared the two. That is how
 * a reversed payment or a voided invoice came to be stored and never acted on
 * (RA-8427), and how RA-6964 and RA-8423 happened.
 *
 * "open-defect" entries are not accepted behaviour. They are rows that sit
 * PENDING until prune-webhook-events deletes them, or are closed SKIPPED
 * without anything being done. Each names the ticket that owns the fix; a fix
 * moves the entry to "drained" or "skipped-at-ingest".
 */

export type WebhookProvider = "XERO" | "QUICKBOOKS" | "MYOB" | "SERVICEM8";

/** Cron directory under app/api/cron that drains a provider's rows. */
export type WebhookDrainCron = "sync-xero-payments" | "sync-qbo-myob-payments";

export type WebhookEventDisposition =
  | { readonly kind: "drained"; readonly cron: WebhookDrainCron }
  | { readonly kind: "skipped-at-ingest"; readonly reason: string }
  | {
      readonly kind: "open-defect";
      readonly ticket: string;
      readonly whatHappens: string;
    };

export interface WebhookEventTypeEntry {
  readonly provider: WebhookProvider;
  readonly eventType: string;
  readonly disposition: WebhookEventDisposition;
}

/**
 * Accepted by processXeroWebhookBatch (lib/integrations/xero/webhook-processor.ts),
 * run by /api/cron/sync-xero-payments. Anything else is closed SKIPPED.
 */
export const XERO_DRAIN_INVOICE_UPDATE_TYPES = [
  "invoice.updated",
  "invoice.created",
] as const;
export const XERO_DRAIN_INVOICE_PAID_TYPES = [
  "invoice.paid",
  "payment.created",
] as const;

/**
 * Selected by processQboMyobPendingPayments (lib/integrations/webhook-processor.ts),
 * run by /api/cron/sync-qbo-myob-payments. That drain still carries its own
 * literal (RA-8426 edits the same lines); the guard test fails if the two
 * differ. Import this constant there once RA-8426 has merged.
 */
export const QBO_MYOB_DRAIN_EVENT_TYPES = [
  "invoice.paid",
  "payment.created",
] as const;

/** Every type each drain accepts, keyed by the cron that runs it. */
export const DRAIN_ACCEPTS: Readonly<
  Record<WebhookDrainCron, { readonly providers: readonly WebhookProvider[]; readonly eventTypes: readonly string[] }>
> = {
  "sync-xero-payments": {
    providers: ["XERO"],
    eventTypes: [...XERO_DRAIN_INVOICE_UPDATE_TYPES, ...XERO_DRAIN_INVOICE_PAID_TYPES],
  },
  "sync-qbo-myob-payments": {
    providers: ["QUICKBOOKS", "MYOB"],
    eventTypes: QBO_MYOB_DRAIN_EVENT_TYPES,
  },
};

const PENDING_UNTIL_PRUNED =
  "stored PENDING; no drain that production runs selects it, so prune-webhook-events deletes it unread";
const QBO_MYOB_NOT_SCHEDULED =
  "stored PENDING; no scheduled drain selects it: sync-qbo-myob-payments reads only invoice.paid and payment.created (and is itself excluded from production, production-schedule.ts), and the generic queue route POST /api/webhooks/process has no schedule";
const XERO_SKIPPED_UNREAD =
  "closed SKIPPED by the Xero drain without being read";
const PAYMENT_STUB_REASON =
  "the notification is an id-only stub with no amount or invoice link (RA-6974)";

const UNMAPPED_EMPTY =
  "an operation the route does not map (for example a QuickBooks invoice Merge) is stored with an empty event type; no drain selects it, so prune-webhook-events deletes it unread";

function openDefect(provider: WebhookProvider, eventType: string, whatHappens: string): WebhookEventTypeEntry {
  return { provider, eventType, disposition: { kind: "open-defect", ticket: "RA-8427", whatHappens } };
}

export const WEBHOOK_EVENT_TYPES: readonly WebhookEventTypeEntry[] = [
  // Xero — app/api/webhooks/xero/route.ts
  { provider: "XERO", eventType: "invoice.created", disposition: { kind: "drained", cron: "sync-xero-payments" } },
  { provider: "XERO", eventType: "invoice.updated", disposition: { kind: "drained", cron: "sync-xero-payments" } },
  { provider: "XERO", eventType: "payment.created", disposition: { kind: "drained", cron: "sync-xero-payments" } },
  openDefect("XERO", "invoice.deleted", XERO_SKIPPED_UNREAD),
  openDefect("XERO", "payment.updated", XERO_SKIPPED_UNREAD),
  openDefect("XERO", "contact.created", XERO_SKIPPED_UNREAD),
  openDefect("XERO", "contact.updated", XERO_SKIPPED_UNREAD),

  // QuickBooks — app/api/webhooks/quickbooks/route.ts
  { provider: "QUICKBOOKS", eventType: "payment.created", disposition: { kind: "skipped-at-ingest", reason: PAYMENT_STUB_REASON } },
  openDefect("QUICKBOOKS", "invoice.created", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "invoice.updated", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "invoice.deleted", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "payment.updated", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "payment.deleted", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "customer.created", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "customer.updated", QBO_MYOB_NOT_SCHEDULED),
  openDefect("QUICKBOOKS", "customer.deleted", QBO_MYOB_NOT_SCHEDULED),

  // MYOB — app/api/webhooks/myob/route.ts
  { provider: "MYOB", eventType: "payment.created", disposition: { kind: "skipped-at-ingest", reason: PAYMENT_STUB_REASON } },
  openDefect("MYOB", "invoice.created", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "invoice.updated", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "invoice.deleted", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "payment.updated", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "payment.deleted", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "customer.created", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "customer.updated", QBO_MYOB_NOT_SCHEDULED),
  openDefect("MYOB", "customer.deleted", QBO_MYOB_NOT_SCHEDULED),

  // An operation a route does not map is stored with an empty type.
  openDefect("QUICKBOOKS", "", UNMAPPED_EMPTY),
  openDefect("MYOB", "", UNMAPPED_EMPTY),

  // ServiceM8 — app/api/webhooks/servicem8/route.ts
  openDefect("SERVICEM8", "job.status_updated", PENDING_UNTIL_PRUNED),
  openDefect("SERVICEM8", "job.updated", PENDING_UNTIL_PRUNED),
  openDefect("SERVICEM8", "job.cancelled", PENDING_UNTIL_PRUNED),
  openDefect("SERVICEM8", "customer.updated", PENDING_UNTIL_PRUNED),
  openDefect("SERVICEM8", "contact.updated", PENDING_UNTIL_PRUNED),
];

/**
 * A value a route stores that no list can name, because it is the provider's
 * own text passed through. The guard test refuses every stored value it
 * cannot trace to a string literal in the route, except the exact expression
 * named here for that provider; an entry no route uses also fails the test.
 */
export interface UnlistableStoredValue {
  readonly provider: WebhookProvider;
  /** Source text of the expression, exactly as written in the route. */
  readonly expression: string;
  readonly ticket: string;
  readonly whatHappens: string;
}

export const UNLISTABLE_STORED_VALUES: readonly UnlistableStoredValue[] = [
  {
    provider: "XERO",
    expression: "event.eventType",
    ticket: "RA-8427",
    whatHappens:
      "an event the Xero route does not map (for example a deleted payment, or an unknown resource) is stored with Xero's raw type such as DELETE; the Xero drain closes it SKIPPED without reading it",
  },
];

/** True when `eventType` is one of `list`. Accepts the nullable column value. */
export function isOneOf(list: readonly string[], eventType: string | null | undefined): boolean {
  return typeof eventType === "string" && list.includes(eventType);
}

/** Ingest route directory under app/api/webhooks for each provider. */
export const INGEST_ROUTE_DIR: Readonly<Record<WebhookProvider, string>> = {
  XERO: "xero",
  QUICKBOOKS: "quickbooks",
  MYOB: "myob",
  SERVICEM8: "servicem8",
};
