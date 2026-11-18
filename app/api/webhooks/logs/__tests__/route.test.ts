/**
 * RA-8447 — GET /api/webhooks/logs must not send whole WebhookEvent rows.
 *
 * The list query had no top-level `select`, so every event carried the
 * provider's `signature` header, `externalEventId` and `updatedAt` to the
 * browser. The page renders none of them. These tests pin the response to the
 * fields the webhooks page actually uses.
 *
 * The mocked findMany behaves like Prisma: with a `select` it returns only the
 * selected keys; without one it returns the whole stored row. That way the
 * test fails if the route stops selecting, not just if a key is renamed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
const findMany = vi.fn();
const count = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

import { GET } from "../route";

const STORED_ROW = {
  id: "evt-1",
  provider: "XERO",
  integrationId: "integ-1",
  eventType: "INVOICE.UPDATED",
  externalEventId: "ext-123",
  payload: { invoiceId: "inv-9", amount: 110 },
  signature: "sig-header-value-from-provider",
  status: "FAILED",
  processedAt: null,
  errorMessage: "boom",
  retryCount: 2,
  createdAt: new Date("2026-11-18T00:00:00Z"),
  updatedAt: new Date("2026-11-18T00:05:00Z"),
  integration: { provider: "XERO", status: "CONNECTED" },
};

/** Apply a Prisma-style select (one level plus nested select) to a row. */
function applySelect(
  row: Record<string, unknown>,
  select: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (!value) continue;
    if (typeof value === "object" && value !== null && "select" in value) {
      out[key] = applySelect(
        row[key] as Record<string, unknown>,
        (value as { select: Record<string, unknown> }).select,
      );
    } else {
      out[key] = row[key];
    }
  }
  return out;
}

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/webhooks/logs${query}`);
}

describe("GET /api/webhooks/logs (RA-8447)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    findMany.mockImplementation(
      async (args: { select?: Record<string, unknown> }) => [
        applySelect(STORED_ROW, args.select),
      ],
    );
    count.mockResolvedValue(1);
  });

  it("uses an explicit select that excludes signature", async () => {
    await GET(makeRequest());
    const args = findMany.mock.calls[0][0];
    expect(args.select).toBeDefined();
    expect(args.include).toBeUndefined();
    expect(args.select.signature).toBeFalsy();
  });

  it("never returns signature or other unrendered fields on any event", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    for (const event of body.events) {
      expect(event).not.toHaveProperty("signature");
      expect(event).not.toHaveProperty("externalEventId");
      expect(event).not.toHaveProperty("updatedAt");
      expect(event).not.toHaveProperty("processedAt");
      expect(event).not.toHaveProperty("integration");
    }
  });

  it("still returns every field the webhooks page renders, including payload", async () => {
    const res = await GET(makeRequest());
    const [event] = (await res.json()).events;
    expect(event).toMatchObject({
      id: "evt-1",
      provider: "XERO",
      eventType: "INVOICE.UPDATED",
      status: "FAILED",
      retryCount: 2,
      errorMessage: "boom",
      payload: { invoiceId: "inv-9", amount: 110 },
    });
    expect(event.createdAt).toBe("2026-11-18T00:00:00.000Z");
  });

  it("keeps the owner scope on the query", async () => {
    await GET(makeRequest());
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      integration: { userId: "user-1" },
    });
  });

  it("returns 401 without a session", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});
