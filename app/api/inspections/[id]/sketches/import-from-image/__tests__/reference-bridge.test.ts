/**
 * RA-8236: a stored, attested floor-plan reference goes to the existing
 * extractor by id. The provider is mocked; no test here makes a paid call.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "../route";

const STORED = Buffer.from("stored-watermarked-png-bytes");
const SHA = createHash("sha256").update(STORED).digest("hex");

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const referenceFindFirst = vi.fn();
const auditFindFirst = vi.fn();
const auditCreate = vi.fn();
const claimSketchFindFirst = vi.fn();
const claimSketchUpdate = vi.fn();
const claimSketchCreate = vi.fn();
const userFindUnique = vi.fn();
const importSketchFromImage = vi.fn();
const resolveFallback = vi.fn();
const applyRateLimit = vi.fn();
const checkWorkspaceBudget = vi.fn();
const getWorkspaceForUser = vi.fn();
const resolveWorkspaceAiKey = vi.fn();
const logAiUsage = vi.fn();
const download = vi.fn();
const executeRaw = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => getServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => {
  const client = {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    sketchUnderlayReference: {
      findFirst: (...a: unknown[]) => referenceFindFirst(...a),
    },
    auditLog: {
      findFirst: (...a: unknown[]) => auditFindFirst(...a),
      create: (...a: unknown[]) => auditCreate(...a),
    },
    claimSketch: {
      findFirst: (...a: unknown[]) => claimSketchFindFirst(...a),
      update: (...a: unknown[]) => claimSketchUpdate(...a),
      create: (...a: unknown[]) => claimSketchCreate(...a),
    },
    $transaction: async (work: (tx: unknown) => unknown) => work(client),
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
  };
  return { prisma: client };
});
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: { from: () => ({ download: (p: string) => download(p) }) },
  }),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", () => ({
  resolveWorkspaceAiKey: (...a: unknown[]) => resolveWorkspaceAiKey(...a),
  NoWorkspaceKeyError: class NoWorkspaceKeyError extends Error {},
}));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...a: unknown[]) => getWorkspaceForUser(...a),
}));
vi.mock("@/lib/ai/budget-guard", () => ({
  checkWorkspaceBudget: (...a: unknown[]) => checkWorkspaceBudget(...a),
}));
vi.mock("@/lib/usage/log-usage", () => ({
  estimateCostUsd: () => 0.01,
  logAiUsage: (...a: unknown[]) => logAiUsage(...a),
}));
vi.mock("@/lib/services/ai/import-sketch-from-image", () => ({
  importSketchFromImage: (...a: unknown[]) => importSketchFromImage(...a),
  SKETCH_READER_PROMPT_VERSION: "test-prompt-version",
}));
vi.mock("@/lib/services/ai/sketch-reader-fallback", () => ({
  estimateAbliterationCostUsd: () => 0,
  resolveSketchReaderFallback: () => resolveFallback(),
}));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...a: unknown[]) => applyRateLimit(...a),
}));

// Same contract as lib/idempotency.ts (covered by its own tests): a key held
// by a running request answers 409, a throw frees the key.
const held = new Set<string>();
const lockInputs: Record<string, unknown>[] = [];
vi.mock("@/lib/idempotency", () => ({
  withIdempotencyFingerprint: async (input: {
    scope: string;
    key: string;
    pendingLeaseMs?: number;
    handler: () => Promise<NextResponse>;
  }) => {
    lockInputs.push(input);
    const slot = `${input.scope}:${input.key}`;
    if (held.has(slot)) {
      return NextResponse.json({ error: "in progress" }, { status: 409 });
    }
    held.add(slot);
    try {
      return await input.handler();
    } finally {
      held.delete(slot);
    }
  },
}));

const ROOM = {
  label: "Lounge",
  vertices: [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.5 },
  ],
};

const reference = {
  id: "ref_1",
  inspectionId: "inspection_1",
  floorNumber: 1,
  storagePath: `inspections/inspection_1/underlays/floor-1-${SHA}.png`,
  sourceType: "upload",
  contentSha256: SHA,
  mimeType: "image/png",
  holdsRights: true,
  compliesWithSourceTerms: true,
};

const readOk = () => ({
  ok: true,
  data: {
    rooms: [ROOM],
    usage: { inputTokens: 10, outputTokens: 5 },
    reader: { vendor: "anthropic", model: "claude-sonnet-4-6" },
  },
});

function request(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(
    "http://localhost/api/inspections/inspection_1/sketches/import-from-image",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        referenceId: "ref_1",
        contentSha256: SHA,
        floorNumber: 1,
        ...body,
      }),
    },
  );
}

const ctx = () => ({ params: Promise.resolve({ id: "inspection_1" }) });
const fetchSpy = vi.fn();

beforeEach(() => {
  held.clear();
  lockInputs.length = 0;
  executeRaw.mockReset().mockResolvedValue(1);
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  getServerSession.mockReset().mockResolvedValue({ user: { id: "user_1" } });
  userFindUnique
    .mockReset()
    .mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  inspectionFindFirst.mockReset().mockResolvedValue({ id: "inspection_1" });
  referenceFindFirst.mockReset().mockResolvedValue(reference);
  auditFindFirst.mockReset().mockResolvedValue(null);
  auditCreate.mockReset().mockResolvedValue({ id: "audit_1" });
  claimSketchFindFirst
    .mockReset()
    .mockResolvedValue({ id: "sketch_1", sketchData: {} });
  claimSketchUpdate.mockReset().mockResolvedValue({ id: "sketch_1" });
  claimSketchCreate.mockReset();
  importSketchFromImage.mockReset().mockResolvedValue(readOk());
  resolveFallback.mockReset().mockReturnValue({ apiKey: "backup" });
  applyRateLimit.mockReset().mockResolvedValue(null);
  checkWorkspaceBudget.mockReset().mockResolvedValue({ ok: true });
  getWorkspaceForUser.mockReset().mockResolvedValue(null);
  resolveWorkspaceAiKey.mockReset().mockResolvedValue({ apiKey: "sk-test" });
  logAiUsage.mockReset();
  download.mockReset().mockResolvedValue({
    data: new Blob([STORED]),
    error: null,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("reference bridge: binding", () => {
  it("reads the exact stored bytes and returns rooms bound to the reference", async () => {
    const res = await POST(request(), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(download).toHaveBeenCalledWith(reference.storagePath);
    expect(importSketchFromImage).toHaveBeenCalledTimes(1);
    const call = importSketchFromImage.mock.calls[0][0];
    expect(call.base64Image).toBe(STORED.toString("base64"));
    expect(call.mediaType).toBe("image/png");
    expect(body.reference).toEqual({
      id: "ref_1",
      contentSha256: SHA,
      floorNumber: 1,
    });
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0].id).toMatch(/^ai-suggested-/);
  });

  it("looks the reference up by id, inspection, floor, hash and active state", async () => {
    await POST(request(), ctx());
    expect(referenceFindFirst.mock.calls[0][0].where).toEqual({
      id: "ref_1",
      inspectionId: "inspection_1",
      floorNumber: 1,
      contentSha256: SHA,
      replacedAt: null,
      removedAt: null,
    });
  });

  it("makes no URL fetch of its own", async () => {
    await POST(request(), ctx());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["missing id", { referenceId: "" }],
    ["short hash", { contentSha256: "abc" }],
    ["fractional floor", { floorNumber: 1.5 }],
    ["floor above the limit", { floorNumber: 51 }],
  ])("rejects %s before any spend", async (_name, override) => {
    const res = await POST(request(override), ctx());
    expect(res.status).toBe(400);
    expect(importSketchFromImage).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses a stale, replaced or foreign reference without spending", async () => {
    referenceFindFirst.mockResolvedValue(null);
    const res = await POST(request(), ctx());
    expect(res.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });

  it("refuses stored bytes that no longer match the recorded hash", async () => {
    download.mockResolvedValue({
      data: new Blob([Buffer.from("tampered")]),
      error: null,
    });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(409);
    expect(importSketchFromImage).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["a URL-sourced reference", { sourceType: "url" }],
    ["a reference without rights", { holdsRights: false }],
    ["a reference without terms", { compliesWithSourceTerms: false }],
    ["a path outside this inspection", { storagePath: "inspections/other/x.png" }],
  ])("refuses %s without spending", async (_name, override) => {
    referenceFindFirst.mockResolvedValue({ ...reference, ...override });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });
});

describe("reference bridge: provenance", () => {
  it("records hash, floor, reference and prompt version in the audit trail", async () => {
    await POST(request(), ctx());
    const data = auditCreate.mock.calls[0][0].data;
    expect(data.inspectionId).toBe("inspection_1");
    expect(data.userId).toBe("user_1");
    const changes = JSON.parse(data.changes);
    expect(changes).toMatchObject({
      referenceId: "ref_1",
      contentSha256: SHA,
      floorNumber: 1,
      promptVersion: "test-prompt-version",
      exportPolicy: "reference_only_never_export",
    });
  });

  it("tells the reader the image is a watermarked reference plan", async () => {
    await POST(request(), ctx());
    expect(importSketchFromImage.mock.calls[0][0].sourceContext).toBe(
      "reference_plan",
    );
  });

  it("never sends reference artwork to the backup vendor", async () => {
    await POST(request(), ctx());
    expect(importSketchFromImage.mock.calls[0][0].fallback).toBeNull();
    expect(resolveFallback).not.toHaveBeenCalled();
  });

  it("returns no image bytes or storage location to the browser", async () => {
    const res = await POST(request(), ctx());
    const text = await res.text();
    expect(text).not.toContain(STORED.toString("base64"));
    expect(text).not.toContain("underlays/");
  });

  it("remembers the suggested room ids on the bound floor", async () => {
    await POST(request(), ctx());
    expect(claimSketchFindFirst.mock.calls[0][0].where).toEqual({
      inspectionId: "inspection_1",
      floorNumber: 1,
    });
    expect(claimSketchUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("reference bridge: tenancy", () => {
  it("keeps AI spend with the job owner (D-028)", async () => {
    await POST(request(), ctx());
    expect(inspectionFindFirst.mock.calls[0][0].where).toEqual({
      id: "inspection_1",
      userId: "user_1",
    });
  });

  it("gives another account an opaque 404 and reads nothing", async () => {
    inspectionFindFirst.mockResolvedValue(null);
    const res = await POST(request(), ctx());
    expect(res.status).toBe(404);
    expect(referenceFindFirst).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(request(), ctx());
    expect(res.status).toBe(401);
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });
});

describe("reference bridge: retries", () => {
  function recordedRead() {
    return {
      changes: JSON.stringify({
        referenceId: "ref_old",
        contentSha256: SHA,
        floorNumber: 1,
        promptVersion: "test-prompt-version",
        reader: { vendor: "anthropic", model: "claude-sonnet-4-6" },
        rooms: [{ id: "ai-suggested-existing", ...ROOM }],
      }),
    };
  }

  it("replays a recorded read with the same room ids and no spend", async () => {
    auditFindFirst.mockResolvedValue(recordedRead());
    const res = await POST(request(), ctx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(body.rooms[0].id).toBe("ai-suggested-existing");
    expect(body.reference.id).toBe("ref_1");
    expect(importSketchFromImage).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(applyRateLimit).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(claimSketchUpdate).not.toHaveBeenCalled();
  });

  it("finds recorded reads by inspection, floor and hash", async () => {
    await POST(request(), ctx());
    expect(auditFindFirst.mock.calls[0][0].where).toMatchObject({
      inspectionId: "inspection_1",
      entityType: "SketchUnderlayExtraction",
      entityId: `1:${SHA}`,
    });
  });

  it("treats an unreadable audit row as no recorded read", async () => {
    auditFindFirst.mockResolvedValue({ changes: "{not json" });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(200);
    expect(importSketchFromImage).toHaveBeenCalledTimes(1);
  });

  it("answers 409 for a second request while the first is running", async () => {
    let finish: (v: unknown) => void = () => undefined;
    importSketchFromImage.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const first = POST(request(), ctx());
    await vi.waitFor(() =>
      expect(importSketchFromImage).toHaveBeenCalledTimes(1),
    );
    const second = await POST(request(), ctx());
    expect(second.status).toBe(409);
    expect(importSketchFromImage).toHaveBeenCalledTimes(1);
    finish(readOk());
    expect((await first).status).toBe(200);
  });

  it("records a read that found no rooms so a retry does not pay again", async () => {
    importSketchFromImage.mockResolvedValue({
      ok: true,
      data: { ...readOk().data, rooms: [] },
    });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(200);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(auditCreate.mock.calls[0][0].data.changes).rooms).toEqual(
      [],
    );
  });
});

describe("reference bridge: the lock outlasts the paid read", () => {
  function recordedRead() {
    return {
      changes: JSON.stringify({
        referenceId: "ref_1",
        contentSha256: SHA,
        floorNumber: 1,
        promptVersion: "test-prompt-version",
        reader: { vendor: "anthropic", model: "claude-sonnet-4-6" },
        rooms: [{ id: "ai-suggested-first-writer", ...ROOM }],
      }),
    };
  }

  afterEach(() => vi.useRealTimers());

  it("gives the provider a deadline shorter than the lock it holds", async () => {
    const res = await POST(request(), ctx());
    expect(res.status).toBe(200);
    expect(lockInputs).toHaveLength(1);
    const lease = lockInputs[0].pendingLeaseMs as number;
    const timeoutMs = importSketchFromImage.mock.calls[0][0].timeoutMs;
    expect(timeoutMs).toBeGreaterThan(0);
    expect(lease).toBeGreaterThan(timeoutMs);
  });

  it("does not spend when reading storage used up the time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    download.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 10 * 60_000);
      return { data: new Blob([STORED]), error: null };
    });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(503);
    expect(importSketchFromImage).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("replays a read recorded while it waited for the lock, without spending", async () => {
    auditFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recordedRead());
    const res = await POST(request(), ctx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(body.rooms[0].id).toBe("ai-suggested-first-writer");
    expect(download).not.toHaveBeenCalled();
    expect(importSketchFromImage).not.toHaveBeenCalled();
  });

  it("keeps the first writer's rooms when two reads finish together", async () => {
    auditFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recordedRead());
    const res = await POST(request(), ctx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(body.rooms[0].id).toBe("ai-suggested-first-writer");
    expect(auditCreate).not.toHaveBeenCalled();
    expect(claimSketchUpdate).not.toHaveBeenCalled();
    expect(claimSketchCreate).not.toHaveBeenCalled();
  });

  it("serialises writers before it checks for a recorded read", async () => {
    await POST(request(), ctx());
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(String(executeRaw.mock.calls[0][0])).toContain(
      "pg_advisory_xact_lock",
    );
    expect(executeRaw.mock.calls[0][1]).toBe(`inspection_1:1:${SHA}`);
    const lockOrder = executeRaw.mock.invocationCallOrder[0];
    const finalCheckOrder = auditFindFirst.mock.invocationCallOrder[2];
    expect(lockOrder).toBeLessThan(finalCheckOrder);
    expect(finalCheckOrder).toBeLessThan(auditCreate.mock.invocationCallOrder[0]);
  });
});

describe("reference bridge: failures leave the reference usable", () => {
  function expectNothingWritten() {
    expect(auditCreate).not.toHaveBeenCalled();
    expect(claimSketchUpdate).not.toHaveBeenCalled();
    expect(claimSketchCreate).not.toHaveBeenCalled();
  }

  it("answers 402 when no workspace key exists, before any read", async () => {
    const { NoWorkspaceKeyError } = await import(
      "@/lib/ai/resolve-workspace-ai-key"
    );
    resolveWorkspaceAiKey.mockRejectedValue(
      new NoWorkspaceKeyError("ANTHROPIC" as never),
    );
    const res = await POST(request(), ctx());
    expect(res.status).toBe(402);
    expect(download).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("answers 429 when the workspace budget is exhausted", async () => {
    getWorkspaceForUser.mockResolvedValue({ id: "ws_1" });
    checkWorkspaceBudget.mockResolvedValue({
      ok: false,
      error: "Budget exhausted",
      remainingUsd: 0,
      budgetUsd: 5,
    });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(429);
    expect(importSketchFromImage).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("passes a provider 429 through with its retry hint", async () => {
    importSketchFromImage.mockResolvedValue({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "busy",
      retryAfterMs: 30_000,
    });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expectNothingWritten();
  });

  it("frees the retry after a failed read so the next one can run", async () => {
    importSketchFromImage.mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      detail: "busy",
    });
    expect((await POST(request(), ctx())).status).toBe(429);
    const retry = await POST(request(), ctx());
    expect(retry.status).toBe(200);
    expect(importSketchFromImage).toHaveBeenCalledTimes(2);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("reports a storage read failure without calling the provider", async () => {
    download.mockResolvedValue({ data: null, error: { message: "gone" } });
    const res = await POST(request(), ctx());
    expect(res.status).toBe(503);
    expect(importSketchFromImage).not.toHaveBeenCalled();
    expectNothingWritten();
  });
});
