import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSession = vi.fn();
const applyRateLimit = vi.fn();
const requireActiveSubscription = vi.fn();
const inspectionPhotoFindFirst = vi.fn();
const inspectionPhotoFindUnique = vi.fn();
const inspectionPhotoUpdate = vi.fn();
const prismaTransaction = vi.fn();
const autoClassifyPhoto = vi.fn();
const resolveWorkspaceAiKey = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => getServerSession(...args),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/billing/subscription-gate", () => ({
  requireActiveSubscription: (...args: unknown[]) =>
    requireActiveSubscription(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspectionPhoto: {
      findFirst: (...args: unknown[]) => inspectionPhotoFindFirst(...args),
      findUnique: (...args: unknown[]) => inspectionPhotoFindUnique(...args),
      update: (...args: unknown[]) => inspectionPhotoUpdate(...args),
    },
    $transaction: (...args: unknown[]) => prismaTransaction(...args),
  },
}));
vi.mock("@/lib/services/ai/auto-classify-photo", () => ({
  autoClassifyPhoto: (...args: unknown[]) => autoClassifyPhoto(...args),
}));
vi.mock("@/lib/ai/resolve-workspace-ai-key", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/ai/resolve-workspace-ai-key")
  >("@/lib/ai/resolve-workspace-ai-key");
  return {
    ...actual,
    resolveWorkspaceAiKey: (...args: unknown[]) =>
      resolveWorkspaceAiKey(...args),
  };
});

import { POST } from "../route";
import { NoWorkspaceKeyError } from "@/lib/ai/resolve-workspace-ai-key";
import { readPhotoAiLatch } from "@/lib/anz/photo-ai-whs";

beforeEach(() => {
  getServerSession.mockReset();
  applyRateLimit.mockReset();
  requireActiveSubscription.mockReset();
  inspectionPhotoFindFirst.mockReset();
  inspectionPhotoFindUnique.mockReset();
  inspectionPhotoUpdate.mockReset();
  prismaTransaction.mockReset();
  autoClassifyPhoto.mockReset();
  resolveWorkspaceAiKey.mockReset();

  resolveWorkspaceAiKey.mockResolvedValue({
    workspaceId: "ws_1",
    apiKey: "anthropic-key",
  });
  getServerSession.mockResolvedValue({ user: { id: "user_1" } });
  applyRateLimit.mockResolvedValue(null);
  requireActiveSubscription.mockResolvedValue(null);
  inspectionPhotoFindFirst.mockResolvedValue({
    id: "photo_1",
    url: "https://example.com/photo.jpg",
    mimeType: "image/jpeg",
    metadata: {},
  });
});

function postRequest() {
  return new NextRequest(
    "http://localhost/api/ai/auto-classify-photo/photo_1",
    { method: "POST" },
  );
}

describe("POST /api/ai/auto-classify-photo/[photoId]", () => {
  it("blocks users without an active subscription before spending Vision API budget (402)", async () => {
    requireActiveSubscription.mockResolvedValueOnce(
      NextResponse.json(
        { error: "Active subscription required", upgradeRequired: true },
        { status: 402 },
      ),
    );

    const response = await POST(postRequest(), {
      params: Promise.resolve({ photoId: "photo_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({
      error: "Active subscription required",
      upgradeRequired: true,
    });
    // The gate must short-circuit before any paid provider work.
    expect(resolveWorkspaceAiKey).not.toHaveBeenCalled();
    expect(autoClassifyPhoto).not.toHaveBeenCalled();
  });

  it("does not expose configured key details when no workspace key is configured", async () => {
    resolveWorkspaceAiKey.mockRejectedValueOnce(
      new NoWorkspaceKeyError("ANTHROPIC"),
    );

    const response = await POST(postRequest(), {
      params: Promise.resolve({ photoId: "photo_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({ error: "KEY_MISSING" });
  });

  it("does not expose provider failure details", async () => {
    autoClassifyPhoto.mockResolvedValueOnce({
      ok: false,
      reason: "API_ERROR",
      detail: "provider failed with key sk-secret and stack trace",
    });

    const response = await POST(postRequest(), {
      params: Promise.resolve({ photoId: "photo_1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "API_ERROR" });
  });

  it("RA-7618: a later no-ACM commit that read stale metadata cannot clear aiRaisedAcm", async () => {
    const photoRow: {
      id: string;
      url: string;
      mimeType: string;
      metadata: Record<string, unknown>;
    } = {
      id: "photo_1",
      url: "https://example.com/photo.jpg",
      mimeType: "image/jpeg",
      metadata: {},
    };

    function snapshot() {
      return { ...photoRow, metadata: structuredClone(photoRow.metadata) };
    }

    function applyUpdate({ data }: { data: Record<string, unknown> }) {
      if (data.metadata !== undefined) {
        photoRow.metadata = data.metadata as Record<string, unknown>;
      }
      return snapshot();
    }

    const txPhoto = {
      findFirst: async () => snapshot(),
      findUnique: async () => snapshot(),
      update: async (args: { data: Record<string, unknown> }) =>
        applyUpdate(args),
    };

    inspectionPhotoFindFirst.mockImplementation(async () => snapshot());
    inspectionPhotoFindUnique.mockImplementation(async () => snapshot());
    inspectionPhotoUpdate.mockImplementation(
      async (args: { data: Record<string, unknown> }) => applyUpdate(args),
    );
    prismaTransaction.mockImplementation(
      async (
        fn: (tx: {
          $queryRaw: (query: unknown) => Promise<unknown>;
          inspectionPhoto: typeof txPhoto;
        }) => Promise<unknown>,
      ) =>
        fn({
          $queryRaw: async () => [{ id: photoRow.id }],
          inspectionPhoto: txPhoto,
        }),
    );

    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    const acmGate = deferred();
    const noAcmGate = deferred();
    let visionCalls = 0;
    autoClassifyPhoto.mockImplementation(async () => {
      const n = ++visionCalls;
      if (n === 1) {
        await acmGate.promise;
        return {
          ok: true,
          data: {
            labels: { secondaryDamageIndicators: ["ASBESTOS_SUSPECT"] },
            confidence: 0.9,
            model: "claude-sonnet-4.5",
          },
        };
      }
      await noAcmGate.promise;
      return {
        ok: true,
        data: {
          labels: { secondaryDamageIndicators: ["MOULD_VISIBLE"] },
          confidence: 0.8,
          model: "claude-sonnet-4.5",
        },
      };
    });

    const params = { params: Promise.resolve({ photoId: "photo_1" }) };
    const acmPending = POST(postRequest(), params);
    const noAcmPending = POST(postRequest(), params);

    await vi.waitFor(() => expect(autoClassifyPhoto).toHaveBeenCalledTimes(2));

    acmGate.resolve();
    await vi.waitFor(() => {
      expect(readPhotoAiLatch(photoRow.metadata).aiRaisedAcm).toBe(true);
    });

    noAcmGate.resolve();
    const [acmRes, noAcmRes] = await Promise.all([acmPending, noAcmPending]);
    expect(acmRes.status).toBe(200);
    expect(noAcmRes.status).toBe(200);
    expect(readPhotoAiLatch(photoRow.metadata).aiRaisedAcm).toBe(true);
  });

  it("RA-7618: FOR UPDATE lock runs before the metadata read inside the write transaction", async () => {
    autoClassifyPhoto.mockResolvedValueOnce({
      ok: true,
      data: {
        labels: { secondaryDamageIndicators: ["MOULD_VISIBLE"] },
        confidence: 0.8,
        model: "claude-sonnet-4.5",
      },
    });

    const txOrder: string[] = [];
    const lockQueries: unknown[] = [];

    prismaTransaction.mockImplementation(
      async (
        fn: (tx: {
          $queryRaw: (query: unknown) => Promise<unknown>;
          inspectionPhoto: {
            findUnique: (args: unknown) => Promise<unknown>;
            update: (args: { data: Record<string, unknown> }) => Promise<unknown>;
          };
        }) => Promise<unknown>,
      ) =>
        fn({
          $queryRaw: async (query: unknown) => {
            txOrder.push("lock");
            lockQueries.push(query);
            return [{ id: "photo_1" }];
          },
          inspectionPhoto: {
            findUnique: async () => {
              txOrder.push("read");
              return {
                metadata: {
                  photoAi: { whsLatch: { aiRaisedAcm: true } },
                },
              };
            },
            update: async ({ data }) => {
              txOrder.push("write");
              return { id: "photo_1", ...data };
            },
          },
        }),
    );

    const response = await POST(postRequest(), {
      params: Promise.resolve({ photoId: "photo_1" }),
    });
    expect(response.status).toBe(200);
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
    expect(txOrder).toEqual(["lock", "read", "write"]);

    const lockSql = prismaSqlText(lockQueries[0]);
    expect(lockSql).toContain('SELECT "id" FROM "InspectionPhoto"');
    expect(lockSql).toContain("FOR UPDATE");
    expect(prismaSqlValues(lockQueries[0])).toContain("photo_1");
  });
});

function prismaSqlText(query: unknown): string {
  if (!query || typeof query !== "object") return String(query);
  const q = query as { sql?: string; strings?: readonly string[] };
  if (typeof q.sql === "string") return q.sql;
  if (Array.isArray(q.strings)) return q.strings.join(" ");
  return String(query);
}

function prismaSqlValues(query: unknown): unknown[] {
  if (!query || typeof query !== "object") return [];
  const q = query as { values?: unknown[] };
  return Array.isArray(q.values) ? q.values : [];
}
