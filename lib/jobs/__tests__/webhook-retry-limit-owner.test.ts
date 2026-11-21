import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { WEBHOOK_MAX_RETRIES } from "@/lib/jobs/webhook-reclaim";

/**
 * RA-8481 — the WebhookEvent retry limit has one owner:
 * `WEBHOOK_MAX_RETRIES` in lib/jobs/webhook-reclaim.ts.
 *
 * The reclaim marks a row FAILED at that bound, retryFailedEvents puts FAILED
 * rows back to PENDING below its bound, and the drains decide FAILED or
 * PENDING by their own bound. If any of those numbers drifts from the others,
 * a row the reclaim gave up on goes back into the queue, or a row is given up
 * on early. So no file that works with WebhookEvent rows may compare a retry
 * count against its own number: it imports the constant.
 */

const ROOT = join(__dirname, "..", "..", "..");
const OWNER = "lib/jobs/webhook-reclaim.ts";

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/** Files that read, write or drain WebhookEvent rows. */
function touchesWebhookEvents(source: string): boolean {
  return /\.webhookEvent\.|@\/lib\/jobs\/webhook-(queue|reclaim)"/.test(source);
}

/** Strip line and block comments so prose such as "max 5 retries" is ignored. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/**
 * A retry count compared with, or a retry bound set to, a number literal.
 * `retryCount: 0` in a reset is data, not a bound, so it does not match.
 */
const LITERAL_BOUND = [
  /\bretryCount\s*:\s*\{\s*(lt|lte|gt|gte)\s*:\s*\d+/g,
  /\bretryCount\s*(<|<=|>|>=)\s*\d+/g,
  /\b(maxRetries|MAX_RETRIES|maxAttempts|MAX_ATTEMPTS)\s*(=|:)\s*\d+/g,
];

function literalBounds(source: string): string[] {
  const code = withoutComments(source);
  const hits: string[] = [];
  for (const pattern of LITERAL_BOUND) {
    for (const match of code.matchAll(pattern)) {
      const line = code.slice(0, match.index).split("\n").length;
      hits.push(`${line}: ${match[0]}`);
    }
  }
  return hits;
}

const scanned = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib"))]
  .map((path) => ({ path: relative(ROOT, path), source: readFileSync(path, "utf8") }))
  .filter((f) => f.path !== OWNER && touchesWebhookEvents(f.source));

describe("RA-8481 — one WebhookEvent retry limit", () => {
  it("scans the files that hold WebhookEvent retry logic", () => {
    const paths = scanned.map((f) => f.path);
    // A scan that found nothing would pass vacuously.
    for (const expected of [
      "lib/jobs/webhook-queue.ts",
      "lib/integrations/webhook-processor.ts",
      "lib/integrations/xero/webhook-processor.ts",
      "app/api/cron/retry-failed-webhooks/route.ts",
      "app/api/integrations/health/route.ts",
      "app/api/integrations/sync-errors/route.ts",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("no file outside the owner compares a retry count with its own number", () => {
    const offenders = scanned
      .map((f) => ({ path: f.path, hits: literalBounds(f.source) }))
      .filter((f) => f.hits.length > 0)
      .map((f) => `${f.path}\n    ${f.hits.join("\n    ")}`);
    expect(
      offenders,
      `Import WEBHOOK_MAX_RETRIES from ${OWNER} instead of a literal:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the owner declares the bound once", () => {
    const owner = readFileSync(join(ROOT, OWNER), "utf8");
    expect(owner.match(/export const WEBHOOK_MAX_RETRIES = \d+;/g)).toHaveLength(1);
    expect(WEBHOOK_MAX_RETRIES).toBeGreaterThan(1);
  });

  it("negative control: the scanner catches each literal form it bans", () => {
    expect(literalBounds("where: { retryCount: { lt: 5 } }")).toHaveLength(1);
    expect(literalBounds("retryCount: { gte: 5 },")).toHaveLength(1);
    expect(literalBounds("if (retryCount >= 5) {")).toHaveLength(1);
    expect(literalBounds("const maxRetries = 5;")).toHaveLength(1);
    expect(literalBounds("const MAX_RETRIES = 5;")).toHaveLength(1);
    expect(literalBounds("retryFailedEvents({ maxRetries: 5 })")).toHaveLength(1);
    // Allowed: the imported constant, a reset to zero, and prose.
    expect(literalBounds("retryCount: { lt: WEBHOOK_MAX_RETRIES }")).toEqual([]);
    expect(literalBounds("data: { retryCount: 0 }")).toEqual([]);
    expect(literalBounds("// Max 5 retries: maxRetries = 5")).toEqual([]);
    expect(touchesWebhookEvents("prisma.webhookEvent.count()")).toBe(true);
  });
});
