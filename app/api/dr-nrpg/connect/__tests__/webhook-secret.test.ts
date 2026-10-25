/**
 * RA-8076 — user-supplied DR-NRPG webhook secrets.
 *
 * The webhook receiver binds an event to whichever active integration's
 * secret verifies its signature, oldest first. So a short secret is guessable
 * (forged job events), and a secret shared by two businesses routes the newer
 * one's jobs to the older one. Connect must refuse both before saving.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Mirrors the real vault shape closely enough for isEncryptedToken(): the
// receiver and connect route both treat non-cipher rows as legacy plaintext.
vi.mock("@/lib/credential-vault", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  isEncryptedToken: vi.fn((v: string) => v.startsWith("enc:")),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _userId: string,
      fn: (raw: string) => Promise<Response>,
    ) => fn(await req.text()),
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    drNrpgIntegration: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(async () => ({ allowed: true, sku: "SERVICE_CRM" })),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const db = (
  prisma as unknown as {
    drNrpgIntegration: {
      upsert: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  }
).drNrpgIntegration;

const SHARED = "a".repeat(64);

function makePost(body: object): NextRequest {
  return new NextRequest("http://localhost/api/dr-nrpg/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let logSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "user_B" } });
  db.upsert.mockResolvedValue({ id: "integ-B" });
  db.findMany.mockResolvedValue([]);
  logSpies = (["log", "info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

function loggedText(): string {
  return logSpies
    .flatMap((s) => s.mock.calls)
    .map((c) => c.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
    .join("\n");
}

describe("RA-8076 — webhookSecret validation on /api/dr-nrpg/connect", () => {
  it("rejects a user-supplied secret shorter than 32 characters and saves nothing", async () => {
    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: "x" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("32");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("measures length after trimming, so padding cannot satisfy the minimum", async () => {
    const res = await POST(
      makePost({ drNrpgApiKey: "k", webhookSecret: `   ${"b".repeat(31)}      ` }),
    );

    expect(res.status).toBe(400);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("refuses a secret another active integration already holds, and saves nothing", async () => {
    db.findMany.mockResolvedValue([
      { id: "integ-A", webhookSecret: `enc:${SHARED}` },
    ]);

    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED }));

    expect(res.status).toBe(409);
    expect(db.upsert).not.toHaveBeenCalled();
    // The clash check must exclude the caller's own row and look only at
    // active integrations — the set the receiver matches against.
    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, userId: { not: "user_B" } },
      }),
    );
    const text = JSON.stringify(await res.json()) + loggedText();
    expect(text).not.toContain(SHARED);
  });

  it("also detects a clash against a legacy plaintext (pre-backfill) row", async () => {
    db.findMany.mockResolvedValue([{ id: "integ-A", webhookSecret: SHARED }]);

    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED }));

    expect(res.status).toBe(409);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("lets the same user reconnect with their own current secret", async () => {
    // findMany excludes the caller's row, so their own secret is not a clash.
    db.findMany.mockResolvedValue([
      { id: "integ-A", webhookSecret: `enc:${"c".repeat(64)}` },
    ]);

    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED }));

    expect(res.status).toBe(200);
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect((await res.json()).webhookSecret).toBe(SHARED);
  });

  it("still auto-generates a 64-hex secret when none is supplied, and returns it once", async () => {
    const res = await POST(makePost({ drNrpgApiKey: "k" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.calls[0][0].create.webhookSecret).toBe(
      `enc:${body.webhookSecret}`,
    );
    expect(loggedText()).not.toContain(body.webhookSecret);
  });
});
