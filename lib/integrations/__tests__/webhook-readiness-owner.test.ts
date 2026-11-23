/**
 * RA-8446 slice 2: webhook binding and the Xero binding guards take "is this
 * connection usable" from the readiness owner (getOAuthReadiness), never from
 * a raw Integration.status comparison or a copy of the owner's status list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/integrations/sync-queue", () => ({ queueInvoiceSync: vi.fn() }));
vi.mock("@/lib/services/xero/credentials", () => ({ getValidXeroAccessToken: vi.fn() }));
vi.mock("@/lib/jobs/webhook-reclaim", () => ({ reclaimStaleWebhookEvents: vi.fn() }));

import { resolveXeroWebhookBinding } from "@/lib/integrations/xero/webhook-processor";

type Candidate = Awaited<ReturnType<Parameters<typeof resolveXeroWebhookBinding>[1]>>[number];

function row(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "integration_1", userId: "owner_1", workspaceId: null, provider: "XERO",
    name: "Xero", icon: null, config: null, tenantId: "tenant_1", status: "CONNECTED",
    ...overrides,
  };
}

const allPresent = async (ids: string[]) => new Set(ids);
const nonePresent = async () => new Set<string>();

describe("resolveXeroWebhookBinding (RA-8446)", () => {
  it.each(["SYNCING", "ERROR"])("binds a %s connection the owner calls ready", async (status) => {
    const result = await resolveXeroWebhookBinding("tenant_1", async () => [row({ status })], allPresent);
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ id: "integration_1" }) });
  });

  it("refuses a CONNECTED connection with no stored credentials, naming the owner's reason", async () => {
    const result = await resolveXeroWebhookBinding("tenant_1", async () => [row()], nonePresent);
    expect(result).toEqual({ ok: false, reason: "NOT_READY", detail: "CREDENTIALS_REQUIRED" });
  });

  it("prefers the one ready connection over a not-ready one for the same tenant", async () => {
    const result = await resolveXeroWebhookBinding(
      "tenant_1",
      async () => [row({ id: "stale" }), row({ id: "ready", status: "SYNCING" })],
      async () => new Set(["ready"]),
    );
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ id: "ready" }) });
  });

  it("does not choose between two ready connections", async () => {
    const result = await resolveXeroWebhookBinding("tenant_1", async () => [row({ id: "a" }), row({ id: "b", status: "ERROR" })], allPresent);
    expect(result).toEqual({ ok: false, reason: "AMBIGUOUS_TENANT" });
  });

  it("reports an unknown tenant when no connection names it", async () => {
    const result = await resolveXeroWebhookBinding("tenant_1", async () => [row({ tenantId: "other" })], allPresent);
    expect(result).toEqual({ ok: false, reason: "UNKNOWN_TENANT" });
  });
});

/** A hand-typed readiness decision: the owner's status list, or a raw CONNECTED read. */
const STATUS_LIST = /\[\s*["']CONNECTED["']\s*,\s*["']SYNCING["']/;
const RAW_CONNECTED_READ = /status\s*(?:===|!==|==|!=)\s*["']CONNECTED["']|(?:where|integration)\s*:\s*\{[^}]*status\s*:\s*["']CONNECTED["']/s;
const STATUS_IN_WHERE = /status\s*:\s*["']CONNECTED["']/;

const ROOT = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** Files that only read status: any CONNECTED literal there is a readiness decision. */
const READ_ONLY = [
  "app/api/webhooks/myob/route.ts",
  "app/api/webhooks/quickbooks/route.ts",
  "app/api/webhooks/servicem8/route.ts",
  "app/api/webhooks/xero/route.ts",
  "lib/integrations/xero/webhook-processor.ts",
];
/** Files that also write status (CONNECTED after a sync): only the list and raw reads are banned. */
const READ_WRITE = ["lib/services/xero/binding.ts", "lib/integrations/xero/client.ts"];

function handTyped(source: string, readOnly: boolean): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return STATUS_LIST.test(code) || RAW_CONNECTED_READ.test(code) || (readOnly && STATUS_IN_WHERE.test(code));
}

describe("no hand-typed readiness in the webhook and Xero binding paths (RA-8446)", () => {
  it.each(READ_ONLY)("%s asks the owner", (file) => {
    expect(handTyped(read(file), true)).toBe(false);
  });

  it.each(READ_WRITE)("%s asks the owner", (file) => {
    expect(handTyped(read(file), false)).toBe(false);
  });

  // A guard's silence is not a pass: each planted copy must be caught.
  it.each([
    ['["CONNECTED", "SYNCING", "ERROR"].includes(binding.status)', false],
    ["integration.status === 'CONNECTED'", false],
    ['where: { provider: "XERO", tenantId, status: "CONNECTED" }', false],
    ['integration: { provider: "SERVICEM8", status: "CONNECTED" }', false],
    ['{ provider: "MYOB", status: "CONNECTED" }', true],
  ] as const)("catches the planted copy %s", (planted, readOnly) => {
    expect(handTyped(`const x = ${planted};`, readOnly)).toBe(true);
  });

  it("allows the status writes a sync makes", () => {
    expect(handTyped('await updateXeroBinding(b, { status: "CONNECTED", syncError: null });', false)).toBe(false);
  });
});
