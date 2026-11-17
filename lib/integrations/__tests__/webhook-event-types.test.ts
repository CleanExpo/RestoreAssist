/**
 * RA-8427 — guard for the "an ingest route stores an event type that nothing
 * drains" kind (also RA-6964, RA-8423).
 *
 * It discovers instead of listing: it walks app/api/webhooks for every route
 * that creates a WebhookEvent row, reads the event-type strings those routes
 * assign, and compares them with lib/integrations/webhook-event-types.ts.
 * "Drained" entries must be accepted by a drain whose cron production runs
 * (lib/cron/production-schedule.ts, not vercel.json — D-024, D-027).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_ENABLED } from "@/lib/cron/production-schedule";
import {
  DRAIN_ACCEPTS,
  INGEST_ROUTE_DIR,
  QBO_MYOB_DRAIN_EVENT_TYPES,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventTypeEntry,
  type WebhookProvider,
} from "@/lib/integrations/webhook-event-types";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const WEBHOOK_ROOT = join(REPO_ROOT, "app", "api", "webhooks");

/**
 * Event-type literals ("noun.verb") on lines that assign or return an event
 * type. Covers `eventType = "x.y"`, `standardEventType = "x.y"` and the
 * ServiceM8 mapper's `return "x.y"`.
 */
function extractStoredEventTypes(source: string): Set<string> {
  const found = new Set<string>();
  for (const line of source.split("\n")) {
    if (!/(eventType\s*=(?!=)|EventType\s*=(?!=)|\breturn\s+(active\s*\?\s*)?")/.test(line)) continue;
    for (const m of line.matchAll(/"([a-z]+\.[a-z_]+)"/g)) found.add(m[1]);
  }
  return found;
}

function walkRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkRoutes(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

/** Every webhook route that writes a WebhookEvent row, keyed by its directory. */
function discoverIngestRoutes(): Map<string, string> {
  const routes = new Map<string, string>();
  for (const file of walkRoutes(WEBHOOK_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (!/webhookEvent\.create\(/.test(source)) continue;
    routes.set(relative(WEBHOOK_ROOT, file).split(sep).slice(0, -1).join("/"), source);
  }
  return routes;
}

/** Problems between what routes store and what the registry declares. */
function compareWithRegistry(
  stored: ReadonlyMap<WebhookProvider, ReadonlySet<string>>,
  registry: readonly WebhookEventTypeEntry[],
  productionCrons: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const [provider, types] of stored) {
    for (const t of types) {
      if (!registry.some((e) => e.provider === provider && e.eventType === t)) {
        problems.push(`${provider} route stores "${t}" but webhook-event-types.ts does not list it`);
      }
    }
  }
  for (const e of registry) {
    if (!stored.get(e.provider)?.has(e.eventType)) {
      problems.push(`${e.provider} "${e.eventType}" is listed but no ingest route stores it`);
    }
    if (e.disposition.kind === "drained") {
      const drain = DRAIN_ACCEPTS[e.disposition.cron];
      if (!drain.providers.includes(e.provider) || !drain.eventTypes.includes(e.eventType)) {
        problems.push(`${e.provider} "${e.eventType}" is marked drained by ${e.disposition.cron}, which does not accept it`);
      }
      if (!productionCrons.has(e.disposition.cron)) {
        problems.push(`${e.provider} "${e.eventType}" is marked drained by ${e.disposition.cron}, which production does not run`);
      }
    }
    if (e.disposition.kind === "open-defect" && !/^RA-\d+$/.test(e.disposition.ticket)) {
      problems.push(`${e.provider} "${e.eventType}" is an open defect with no ticket`);
    }
  }
  return problems;
}

const PRODUCTION_CRONS = new Set(PRODUCTION_ENABLED.map((c) => c.path));

function storedByProvider(): Map<WebhookProvider, Set<string>> {
  const routes = discoverIngestRoutes();
  const stored = new Map<WebhookProvider, Set<string>>();
  for (const [provider, dir] of Object.entries(INGEST_ROUTE_DIR) as [WebhookProvider, string][]) {
    const source = routes.get(dir);
    if (source) stored.set(provider, extractStoredEventTypes(source));
  }
  return stored;
}

describe("webhook event-type registry (RA-8427)", () => {
  it("knows every webhook route that writes a WebhookEvent row", () => {
    const known = new Set(Object.values(INGEST_ROUTE_DIR));
    const routes = [...discoverIngestRoutes().keys()];
    expect(routes.length).toBeGreaterThanOrEqual(4);
    expect(routes.filter((r) => !known.has(r))).toEqual([]);
    expect([...known].filter((d) => !routes.includes(d))).toEqual([]);
  });

  it("matches what the ingest routes store, and drained types reach a production drain", () => {
    expect(compareWithRegistry(storedByProvider(), WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS)).toEqual([]);
  });

  it("the QuickBooks/MYOB drain selects exactly the registry's list", () => {
    // Exact generated text, not a parse: RA-8426 owns these lines until it merges.
    const source = readFileSync(join(REPO_ROOT, "lib", "integrations", "webhook-processor.ts"), "utf8");
    const expected = `eventType: { in: ${JSON.stringify(QBO_MYOB_DRAIN_EVENT_TYPES).replace(/,/g, ", ")} },`;
    const inLists = source.match(/eventType: \{ in: [^}]*\},/g) ?? [];
    expect(inLists).toEqual([expected]);
  });

  it("lists each (provider, eventType) once", () => {
    const keys = WEBHOOK_EVENT_TYPES.map((e) => `${e.provider}:${e.eventType}`);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("extracts the reversal types from the real routes (the scanner sees them)", () => {
    const stored = storedByProvider();
    expect(stored.get("QUICKBOOKS")).toContain("payment.deleted");
    expect(stored.get("MYOB")).toContain("payment.deleted");
    expect(stored.get("XERO")).toContain("payment.updated");
    expect(stored.get("XERO")).toContain("invoice.deleted");
    expect(stored.get("SERVICEM8")).toContain("job.cancelled");
  });

  // Negative controls: each plants one fault in a copy and must be reported.
  it("fails when a route stores a type the registry does not list", () => {
    const planted = extractStoredEventTypes(
      readFileSync(join(WEBHOOK_ROOT, "quickbooks", "route.ts"), "utf8").replace(
        'eventType = "payment.deleted";',
        'eventType = "payment.reversed";',
      ),
    );
    const stored = storedByProvider();
    stored.set("QUICKBOOKS", planted);
    const problems = compareWithRegistry(stored, WEBHOOK_EVENT_TYPES, PRODUCTION_CRONS);
    expect(problems).toContain('QUICKBOOKS route stores "payment.reversed" but webhook-event-types.ts does not list it');
    expect(problems).toContain('QUICKBOOKS "payment.deleted" is listed but no ingest route stores it');
  });

  it("fails, naming the reversal and ServiceM8 types, when only drained types are registered (main before RA-8427)", () => {
    const drainedOnly = WEBHOOK_EVENT_TYPES.filter((e) => e.disposition.kind === "drained");
    const problems = compareWithRegistry(storedByProvider(), drainedOnly, PRODUCTION_CRONS).join("\n");
    for (const name of [
      'QUICKBOOKS route stores "payment.deleted"',
      'MYOB route stores "payment.updated"',
      'XERO route stores "invoice.deleted"',
      'SERVICEM8 route stores "job.status_updated"',
    ]) {
      expect(problems).toContain(name);
    }
  });

  it("fails when a type is marked drained but its drain does not accept it or production does not run it", () => {
    const planted: WebhookEventTypeEntry[] = WEBHOOK_EVENT_TYPES.map((e) =>
      e.provider === "QUICKBOOKS" && e.eventType === "payment.deleted"
        ? { ...e, disposition: { kind: "drained", cron: "sync-qbo-myob-payments" } }
        : e,
    );
    const problems = compareWithRegistry(storedByProvider(), planted, PRODUCTION_CRONS);
    expect(problems).toContain(
      'QUICKBOOKS "payment.deleted" is marked drained by sync-qbo-myob-payments, which does not accept it',
    );
    expect(problems).toContain(
      'QUICKBOOKS "payment.deleted" is marked drained by sync-qbo-myob-payments, which production does not run',
    );
  });
});
