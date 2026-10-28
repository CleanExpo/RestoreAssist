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
vi.mock("@/lib/prisma", () => {
  const drNrpgIntegration = {
    upsert: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
  };
  // Like pg_advisory_xact_lock: the lock statement waits for the previous
  // holder, and the end of the transaction releases it. Without the statement
  // two transactions run side by side, as they would on Postgres.
  let tail: Promise<void> = Promise.resolve();
  const lockCalls = vi.fn();
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    let release: (() => void) | undefined;
    const tx = {
      drNrpgIntegration,
      $executeRaw: async (query: { sql?: string }) => {
        lockCalls(query?.sql ?? String(query));
        const previous = tail;
        tail = new Promise<void>((resolve) => (release = resolve));
        await previous;
      },
    };
    try {
      return await fn(tx);
    } finally {
      release?.();
    }
  });
  return { prisma: { drNrpgIntegration, $transaction, lockCalls } };
});
vi.mock("@/lib/entitlements", () => ({
  requireAddon: vi.fn(async () => ({ allowed: true, sku: "SERVICE_CRM" })),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/credential-vault";
import { POST } from "../route";

const mockSession = getServerSession as unknown as ReturnType<typeof vi.fn>;
const mockDecrypt = decrypt as unknown as ReturnType<typeof vi.fn>;
// A stored value the vault cannot open (key changed, or the row is corrupt).
const CORRUPT = "enc:corrupt";
const fakePrisma = prisma as unknown as {
  drNrpgIntegration: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
  lockCalls: ReturnType<typeof vi.fn>;
};
const db = fakePrisma.drNrpgIntegration;

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
  mockDecrypt.mockImplementation((v: string) => {
    if (v === CORRUPT) throw new Error("Unsupported state or unable to authenticate data");
    return v.replace(/^enc:/, "");
  });
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
    // The clash read happens under the advisory lock, inside the transaction.
    expect(fakePrisma.lockCalls).toHaveBeenCalledTimes(1);
    expect(fakePrisma.lockCalls.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(fakePrisma.lockCalls.mock.invocationCallOrder[0]).toBeLessThan(
      db.findMany.mock.invocationCallOrder[0],
    );
  });

  it("also detects a clash against a legacy plaintext (pre-backfill) row", async () => {
    db.findMany.mockResolvedValue([{ id: "integ-A", webhookSecret: SHARED }]);

    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED }));

    expect(res.status).toBe(409);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("a stored secret that cannot be decrypted does not block a new secret", async () => {
    db.findMany.mockResolvedValue([{ id: "integ-bad", webhookSecret: CORRUPT }]);

    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED }));

    expect(res.status).toBe(200);
    expect(db.upsert).toHaveBeenCalledTimes(1);
    // The bad row is reported by id only, never by value.
    expect(loggedText()).toContain("integ-bad");
    expect(loggedText()).not.toContain(SHARED);
  });

  it("a stored secret that cannot be decrypted does not hide a clash with a readable row", async () => {
    db.findMany.mockResolvedValue([
      { id: "integ-bad", webhookSecret: CORRUPT },
      { id: "integ-A", webhookSecret: `enc:${SHARED}` },
    ]);

    const res = await POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED }));

    expect(res.status).toBe(409);
    expect(db.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.json()) + loggedText()).not.toContain(SHARED);
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
    expect(fakePrisma.$transaction).not.toHaveBeenCalled();
  });

  it("two businesses connecting at once with the same secret: exactly one is saved", async () => {
    // A stateful table. Each clash read is slow, so without the lock both reads
    // finish before either write and both connects would store the secret.
    const rows: { userId: string; webhookSecret: string }[] = [];
    db.findMany.mockImplementation(
      async ({ where }: { where: { userId: { not: string } } }) => {
        const seen = rows
          .filter((r) => r.userId !== where.userId.not)
          .map((r) => ({ webhookSecret: r.webhookSecret }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        return seen;
      },
    );
    db.upsert.mockImplementation(
      async ({
        where,
        create,
      }: {
        where: { userId: string };
        create: { webhookSecret: string };
      }) => {
        rows.push({ userId: where.userId, webhookSecret: create.webhookSecret });
        return { id: `integ-${where.userId}` };
      },
    );
    mockSession
      .mockResolvedValueOnce({ user: { id: "user_A" } })
      .mockResolvedValueOnce({ user: { id: "user_B" } });

    const [first, second] = await Promise.all([
      POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED })),
      POST(makePost({ drNrpgApiKey: "k", webhookSecret: SHARED })),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(rows.filter((r) => r.webhookSecret === `enc:${SHARED}`)).toHaveLength(1);
  });
});
